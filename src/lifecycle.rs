use crate::config;
use std::fs;
use std::path::Path;

pub fn check_terms() {
    if !config::terms_path().exists() {
        eprintln!(
            "Error: Terms of Use not accepted.\n\
             Run install.sh (or install.ps1 on Windows) to accept."
        );
        std::process::exit(1);
    }
}

pub fn write_pidfile(path: &Path) {
    if let Err(e) = fs::write(path, std::process::id().to_string()) {
        tracing::warn!("failed to write pidfile {}: {e}", path.display());
    }
}

pub fn remove_pidfile(path: &Path) {
    if let Ok(contents) = fs::read_to_string(path) {
        if contents.trim() == std::process::id().to_string() {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(unix)]
pub fn kill_stale(pidfile: &Path) {
    let contents = match fs::read_to_string(pidfile) {
        Ok(c) => c,
        Err(_) => return,
    };
    let pid = match contents.trim().parse::<i32>() {
        Ok(p) => p,
        Err(_) => return,
    };
    // SAFETY: kill(pid, 0) probes process existence without sending a signal.
    unsafe {
        if libc::kill(pid, 0) == 0 {
            tracing::info!("killing stale process {pid}");
            libc::kill(pid, libc::SIGTERM);
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    let _ = fs::remove_file(pidfile);
}

#[cfg(windows)]
pub fn kill_stale(pidfile: &Path) {
    use std::process::Command;
    let contents = match fs::read_to_string(pidfile) {
        Ok(c) => c,
        Err(_) => return,
    };
    let pid = match contents.trim().parse::<u32>() {
        Ok(p) => p,
        Err(_) => return,
    };
    tracing::info!("killing stale process {pid}");
    let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/F"]).output();
    std::thread::sleep(std::time::Duration::from_millis(500));
    let _ = fs::remove_file(pidfile);
}

pub fn cleanup_socket(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}
