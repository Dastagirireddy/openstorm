/**
 * {{project-name}} - A TypeScript library
 */

export interface Greeting {
  message: string;
}

export function hello(name?: string): Greeting {
  const message = name
    ? `Hello, ${name}!`
    : `Hello from {{project-name}}!`;

  return { message };
}
