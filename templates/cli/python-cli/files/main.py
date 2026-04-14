#!/usr/bin/env python3
"""{{project-name}} - A command-line tool built with Python."""

import argparse


def main():
    parser = argparse.ArgumentParser(
        prog="{{project-name}}",
        description="A CLI tool built with Python and Click"
    )
    parser.add_argument(
        "--name", "-n",
        type=str,
        default="",
        help="Name to greet"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        print("Verbose mode enabled")

    if args.name:
        print(f"Hello, {args.name}!")
    else:
        print(f"Hello from {{project-name}}!")


if __name__ == "__main__":
    main()
