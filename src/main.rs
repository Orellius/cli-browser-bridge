mod bridge;
mod config;
mod error;
mod host;
mod lifecycle;
mod mcp;
mod native_messaging;
mod serve;

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "cli-browser-bridge", version, about = "Browser automation bridge for Claude Code by orellius.ai")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    #[arg(trailing_var_arg = true, hide = true)]
    rest: Vec<String>,
}

#[derive(Subcommand)]
enum Command {
    /// MCP server mode — started by Claude Code via stdio
    Serve {
        #[arg(long)]
        socket: Option<PathBuf>,
    },
    /// Native messaging host mode — started by Chrome
    Host {
        #[arg(long)]
        socket: Option<PathBuf>,
    },
    /// Print version
    Version,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("cli_browser_bridge=info".parse().unwrap()),
        )
        .init();

    let cli = Cli::parse();

    // Chrome passes "chrome-extension://..." as argv[1] — auto-enter host mode
    if let Some(first) = cli.rest.first() {
        if first.starts_with("chrome-extension://") {
            tracing::info!("auto-detected host mode (origin: {first})");
            if let Err(e) = host::run(config::socket_path()).await {
                tracing::error!("host error: {e}");
                std::process::exit(1);
            }
            return;
        }
    }

    match cli.command {
        Some(Command::Serve { socket }) => {
            let socket = socket.unwrap_or_else(config::socket_path);
            lifecycle::check_terms();
            if let Err(e) = serve::run(socket).await {
                tracing::error!("serve error: {e}");
                std::process::exit(1);
            }
        }
        Some(Command::Host { socket }) => {
            let socket = socket.unwrap_or_else(config::socket_path);
            if let Err(e) = host::run(socket).await {
                tracing::error!("host error: {e}");
                std::process::exit(1);
            }
        }
        Some(Command::Version) | None => {
            println!("{} {}", config::MCP_SERVER_NAME, config::MCP_SERVER_VERSION);
        }
    }
}
