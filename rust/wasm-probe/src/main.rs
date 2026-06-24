use std::io::Write;

fn main() {
    let mut stdout = std::io::stdout();
    let _ = writeln!(stdout, "hello from sandbox");

    for arg in std::env::args() {
        let _ = writeln!(stdout, "arg: {arg}");
    }

    if let Ok(content) = std::fs::read_to_string("/sandbox/data.txt") {
        let _ = writeln!(stdout, "read: {content}");
    } else {
        let _ = writeln!(stdout, "failed: /sandbox/data.txt");
    }

    match std::fs::read_to_string("/etc/passwd") {
        Ok(_) => {
            let _ = writeln!(stdout, "LEAK: /etc/passwd");
        }
        Err(_) => {
            let _ = writeln!(stdout, "denied: /etc/passwd");
        }
    }

    let _ = std::fs::write("/sandbox/out.txt", "written from sandbox");
    let _ = writeln!(stdout, "wrote: /sandbox/out.txt");

    let _ = stdout.flush();
}
