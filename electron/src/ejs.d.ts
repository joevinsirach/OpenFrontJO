declare module "ejs" {
  export function render(
    template: string,
    data?: Record<string, unknown>,
  ): string;
}
