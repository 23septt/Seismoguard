//! CLI: pipe `ax,ay,az` triples on stdin → JSONL SampleRecord on stdout.

use std::io::{self, BufRead, Write};
use seismoguard_algo::{SeismoGuardAlgo, DT};

fn main() {
    let stdin  = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();
    let mut algo = SeismoGuardAlgo::default();
    let mut t: u32 = 0;
    for line in stdin.lock().lines() {
        let line = match line { Ok(s) => s, Err(_) => break };
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() < 3 { continue; }
        let (ax, ay, az) = match (
            parts[0].trim().parse::<f64>(),
            parts[1].trim().parse::<f64>(),
            parts[2].trim().parse::<f64>(),
        ) {
            (Ok(x), Ok(y), Ok(z)) => (x, y, z),
            _ => continue,
        };
        let (rec, decision) = algo.process(ax, ay, az, t);
        let _ = writeln!(out, "{}", rec.to_json());
        if let Some(d) = decision {
            let _ = writeln!(out,
                "{{\"decision\":\"{}\",\"mw\":{:.3},\"pd_m\":{},\"tau_c\":{}}}",
                d.reason, d.mw_est, d.pd_m, d.tau_c);
        }
        t = t.wrapping_add((DT * 1000.0) as u32);
    }
}
