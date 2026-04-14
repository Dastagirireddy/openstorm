use clap::Parser;

/// {{project-name}} - A command-line tool
#[derive(Parser, Debug)]
#[command(name = "{{project-name}}")]
#[command(about = "A CLI tool built with Rust")]
struct Args {
    /// Name of the person to greet
    #[arg(short, long)]
    name: Option<String>,

    /// Enable verbose output
    #[arg(short, long, default_value_t = false)]
    verbose: bool,
}

fn main() {
    let args = Args::parse();

    if args.verbose {
        println!("Verbose mode enabled");
    }

    match args.name {
        Some(name) => println!("Hello, {}!", name),
        None => println!("Hello from {{project-name}}!"),
    }
}
