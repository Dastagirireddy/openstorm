package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	name    string
	verbose bool
)

var rootCmd = &cobra.Command{
	Use:   "{{project-name}}",
	Short: "{{project-name}} - A CLI tool built with Go",
	Long:  `{{project-name}} is a command-line tool built using Cobra framework.`,
	Run: func(cmd *cobra.Command, args []string) {
		if verbose {
			fmt.Println("Verbose mode enabled")
		}

		if name != "" {
			fmt.Printf("Hello, %s!\n", name)
		} else {
			fmt.Printf("Hello from {{project-name}}!\n")
		}
	},
}

func main() {
	rootCmd.Flags().StringVarP(&name, "name", "n", "", "Name to greet")
	rootCmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose output")

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
