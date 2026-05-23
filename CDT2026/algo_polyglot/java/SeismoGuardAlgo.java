// SeismoGuardAlgo.java — Java port of the SeismoGuard EEW algorithm.
// Java 17+. Build: javac SeismoGuardAlgo.java && java SeismoGuardAlgo
// Tests embedded in main() — exits non-zero on failure.

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Optional;

public final class SeismoGuardAlgo {

    // ── Canonical constants (see spec/SAMPLE_RECORD.md) ─────────────────
    public static final int    SAMPLE_RATE_HZ  = 100;
    public static final double DT              = 1.0 / SAMPLE_RATE_HZ;
    public static final double ALPHA_STA       = 0.02;
    public static final double ALPHA_LTA       = 0.000333;
    public static final double ALPHA_DC        = 0.001;
    public static final double RATIO_TRIGGER   = 6.0;
    public static final double RATIO_DETRIGGER = 1.5;
    public static final int    MIN_TRIG_COUNT  = 3;
    public static final double SPIKE_LIMIT     = 50.0;
    public static final double LTA_FLOOR       = 1e-9;
    public static final double MIN_TRIG_CF_ABS = 2e-4;
    public static final int    WINDOW_SAMPLES  = 300;
    public static final double HPF_ALPHA       = 0.9901;
    public static final double MW_PD_A         = 0.813;
    public static final double MW_PD_B         = 1.512;
    public static final double MW_PD_C         = 5.130;
    public static final double MW_R_KM_DEFAULT = 10.0;
    public static final int    ALARM_MAX_MS    = 15_000;
    public static final int    LOCKOUT_MAX_MS  =  5_000;

    public enum State { STANDBY, DETECTING, ALARMING, LOCKOUT }

    public static final class SampleRecord {
        public final long   timestampMs;       // u32 range in long
        public final double staLtaRatio;
        public final double cfZ;
        public final double mpdRaw;
        public final int    sampleCount;       // u16 in int

        SampleRecord(long t, double r, double cf, double mpd, int n) {
            this.timestampMs = t & 0xFFFFFFFFL;
            this.staLtaRatio = r;
            this.cfZ         = cf;
            this.mpdRaw      = mpd;
            this.sampleCount = n & 0xFFFF;
        }

        public String toJson() {
            // Precision pinned to match Python/C/Rust:
            //   sta_lta_ratio: 6 decimals
            //   cf_z, mpd_raw: full double precision (Double.toString round-trips)
            return "{\"timestamp_ms\":" + timestampMs
                 + ",\"sta_lta_ratio\":" + String.format(java.util.Locale.ROOT, "%.6f", staLtaRatio)
                 + ",\"cf_z\":" + Double.toString(cfZ)
                 + ",\"mpd_raw\":" + Double.toString(mpdRaw)
                 + ",\"sample_count\":" + sampleCount + "}";
        }
    }

    public static final class Decision {
        public final boolean fireT1, fireT2;
        public final double  mwEst, pdM, tauC;
        public final String  reason;

        Decision(boolean t1, boolean t2, double mw, double pd, double tc, String r) {
            this.fireT1 = t1; this.fireT2 = t2;
            this.mwEst  = mw; this.pdM = pd; this.tauC = tc;
            this.reason = r;
        }
    }

    // ── Instance state ──────────────────────────────────────────────────
    private final double mwT1, mwT2, rKm;
    private State  state;
    private double sta, lta, ltaQuiet;
    private double baselineZ;
    private boolean baselineInit;
    private int    trigCount;
    private double peakRatio;
    private long   alarmStartMs, lockoutStartMs;

    private double hpfAIn, hpfAOut;
    private double vel;
    private double hpfVIn, hpfVOut;
    private double disp;
    private double hpfDIn, hpfDOut;

    private int    winN;
    private double pdMax, tcNum, tcDen;
    private boolean windowOpen;

    private long sampleCount;
    private long startMs;

    public SeismoGuardAlgo() { this(3.5, 4.5, MW_R_KM_DEFAULT); }

    public SeismoGuardAlgo(double mwT1, double mwT2, double rKm) {
        this.mwT1 = mwT1; this.mwT2 = mwT2; this.rKm = rKm;
        reset();
    }

    public void reset() {
        state = State.STANDBY;
        sta = LTA_FLOOR; lta = LTA_FLOOR; ltaQuiet = LTA_FLOOR;
        baselineZ = 0; baselineInit = false;
        trigCount = 0; peakRatio = 0;
        alarmStartMs = 0; lockoutStartMs = 0;
        hpfAIn = hpfAOut = 0; vel = 0;
        hpfVIn = hpfVOut = 0; disp = 0;
        hpfDIn = hpfDOut = 0;
        winN = 0; pdMax = 0; tcNum = 0; tcDen = 0;
        windowOpen = false;
        sampleCount = 0; startMs = 0;
    }

    public void seedLta(double noiseFloorCf) {
        double v = Math.max(noiseFloorCf, LTA_FLOOR);
        sta = v; lta = v; ltaQuiet = v;
    }

    public State state() { return state; }

    public ProcessResult process(double ax, double ay, double az, long tMs) {
        if (sampleCount == 0) startMs = tMs;

        // 1. DC tracker
        if (!baselineInit) { baselineZ = az; baselineInit = true; }
        if (state == State.STANDBY || state == State.DETECTING) {
            baselineZ = ALPHA_DC * az + (1.0 - ALPHA_DC) * baselineZ;
        }
        double dz = az - baselineZ;

        // 2. CF + spike clamp (raw retained for anti-tap)
        double ltaRef = (lta > LTA_FLOOR) ? lta : LTA_FLOOR;
        double cfRaw  = dz * dz;
        double cf     = (cfRaw <= SPIKE_LIMIT * ltaRef) ? cfRaw : SPIKE_LIMIT * ltaRef;

        // 3. STA/LTA
        sta = ALPHA_STA * cf + (1.0 - ALPHA_STA) * sta;
        if (state == State.STANDBY) {
            lta = ALPHA_LTA * cf + (1.0 - ALPHA_LTA) * lta;
        }
        double ratio = (lta > LTA_FLOOR) ? (sta / lta) : 0.0;

        // 4. HPF→∫→HPF→∫→HPF
        double aHpf = HPF_ALPHA * (hpfAOut + dz - hpfAIn);
        hpfAIn = dz; hpfAOut = aHpf;
        vel += aHpf * DT;
        double vHpf = HPF_ALPHA * (hpfVOut + vel - hpfVIn);
        hpfVIn = vel; hpfVOut = vHpf;
        disp += vHpf * DT;
        double dHpf = HPF_ALPHA * (hpfDOut + disp - hpfDIn);
        hpfDIn = disp; hpfDOut = dHpf;

        // 5. Pd window
        Decision decision = null;
        if (windowOpen) {
            double ad = Math.abs(dHpf);
            if (ad > pdMax) pdMax = ad;
            tcNum += dHpf * dHpf;
            tcDen += vel * vel;
            winN++;
            if (winN >= WINDOW_SAMPLES) decision = closeWindow();
        }

        // 6. State machine (uses raw cf for anti-tap)
        stepState(ratio, cfRaw, tMs);

        SampleRecord rec = new SampleRecord(
            tMs - startMs, ratio, cf,
            windowOpen ? pdMax : 0.0,
            (int) sampleCount
        );
        sampleCount++;
        return new ProcessResult(rec, Optional.ofNullable(decision));
    }

    private void openWindow() {
        winN = 0; pdMax = 0; tcNum = 0; tcDen = 0; windowOpen = true;
        hpfAIn = hpfAOut = 0; vel = 0;
        hpfVIn = hpfVOut = 0; disp = 0;
        hpfDIn = hpfDOut = 0;
    }

    private Decision closeWindow() {
        double pd = pdMax;
        double tc = (tcDen > 0)
            ? 2.0 * Math.PI * Math.sqrt(tcNum / tcDen)
            : 0.0;
        double mw = estimateMw(pd);
        windowOpen = false;
        if (mw >= mwT2) return new Decision(true, true,  mw, pd, tc, "Mw_ge_T2");
        if (mw >= mwT1) return new Decision(true, false, mw, pd, tc, "Mw_ge_T1");
        return new Decision(false, false, mw, pd, tc, "below_threshold");
    }

    private double estimateMw(double pdM) {
        if (pdM <= 0) return -99.0;
        return MW_PD_A * Math.log10(pdM) + MW_PD_B * Math.log10(rKm) + MW_PD_C;
    }

    private void stepState(double ratio, double cfRaw, long tMs) {
        switch (state) {
            case STANDBY:
                if (ratio >= RATIO_TRIGGER && cfRaw >= MIN_TRIG_CF_ABS) {
                    trigCount++;
                    if (trigCount >= MIN_TRIG_COUNT) {
                        state = State.DETECTING;
                        peakRatio = ratio;
                        openWindow();
                    }
                } else {
                    trigCount = 0;
                }
                break;
            case DETECTING:
                if (ratio > peakRatio) peakRatio = ratio;
                if (ratio < RATIO_DETRIGGER) {
                    state = State.STANDBY;
                    trigCount = 0; peakRatio = 0;
                }
                break;
            case ALARMING:
                if (tMs - alarmStartMs > ALARM_MAX_MS) {
                    state = State.LOCKOUT;
                    lockoutStartMs = tMs;
                }
                break;
            case LOCKOUT:
                if (tMs - lockoutStartMs > LOCKOUT_MAX_MS) {
                    state = State.STANDBY;
                    lta = ltaQuiet; sta = ltaQuiet;
                }
                break;
        }
    }

    public static final class ProcessResult {
        public final SampleRecord record;
        public final Optional<Decision> decision;
        ProcessResult(SampleRecord r, Optional<Decision> d) { this.record = r; this.decision = d; }
    }

    // ── CLI: stdin CSV → stdout JSONL ───────────────────────────────────
    public static void main(String[] args) throws Exception {
        if (args.length > 0 && args[0].equals("--test")) { System.exit(runTests()); return; }
        SeismoGuardAlgo algo = new SeismoGuardAlgo();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(System.in))) {
            String line; long t = 0;
            while ((line = br.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] parts = line.split(",");
                if (parts.length < 3) continue;
                try {
                    double ax = Double.parseDouble(parts[0]);
                    double ay = Double.parseDouble(parts[1]);
                    double az = Double.parseDouble(parts[2]);
                    ProcessResult r = algo.process(ax, ay, az, t);
                    System.out.println(r.record.toJson());
                    if (r.decision.isPresent()) {
                        Decision d = r.decision.get();
                        System.out.printf("{\"decision\":\"%s\",\"mw\":%.3f,\"pd_m\":%s,\"tau_c\":%s}%n",
                                          d.reason, d.mwEst, d.pdM, d.tauC);
                    }
                } catch (NumberFormatException ignored) {}
                t += (long) (DT * 1000);
            }
        }
    }

    // ── Inline tests ────────────────────────────────────────────────────
    private static int runTests() {
        int fails = 0;
        fails += check("dc_no_trigger",   testDcNoTrigger());
        fails += check("mw_formula",      testMwFormula());
        fails += check("json_schema",     testJsonSchema());
        fails += check("sample_wrap",     testSampleWrap());
        fails += check("synthetic_fires", testSyntheticFires());
        System.out.println(fails == 0 ? "ALL TESTS OK" : (fails + " TEST FAILURE(S)"));
        return fails;
    }

    private static int check(String name, boolean ok) {
        System.out.println((ok ? "[ok]   " : "[FAIL] ") + name);
        return ok ? 0 : 1;
    }

    private static boolean testDcNoTrigger() {
        SeismoGuardAlgo a = new SeismoGuardAlgo();
        for (int i = 0; i < 500; i++) {
            ProcessResult r = a.process(0, 0, 9.81, i * 10L);
            if (r.decision.isPresent()) return false;
        }
        return a.state() == State.STANDBY;
    }

    private static boolean testMwFormula() {
        SeismoGuardAlgo a = new SeismoGuardAlgo();
        double mw = MW_PD_A * Math.log10(1e-3) + MW_PD_B * Math.log10(10.0) + MW_PD_C;
        return Math.abs(a.estimateMw(1e-3) - mw) < 1e-9;
    }

    private static boolean testJsonSchema() {
        SeismoGuardAlgo a = new SeismoGuardAlgo();
        String s = a.process(0, 0, 9.81, 0).record.toJson();
        return s.contains("timestamp_ms") && s.contains("sta_lta_ratio")
            && s.contains("cf_z") && s.contains("mpd_raw") && s.contains("sample_count");
    }

    private static boolean testSampleWrap() {
        SeismoGuardAlgo a = new SeismoGuardAlgo();
        for (long i = 0; i < 65540; i++) a.process(0, 0, 9.81, i * 10L);
        ProcessResult r = a.process(0, 0, 9.81, 65540L * 10);
        return r.record.sampleCount == 4;
    }

    private static boolean testSyntheticFires() {
        SeismoGuardAlgo a = new SeismoGuardAlgo();
        for (int i = 0; i < 100; i++) a.process(0, 0, 9.81, i * 10L);
        for (int i = 0; i < WINDOW_SAMPLES + 100; i++) {
            double t = i * DT;
            double env = Math.exp(-1.5 * t);
            double v = 2.0 * Math.sin(2 * Math.PI * 3 * t) * env;
            ProcessResult r = a.process(0, 0, 9.81 + v, (100L + i) * 10);
            if (r.decision.isPresent()) return true;
        }
        return false;
    }
}
