declare module 'mermaid' {
  const mermaid: {
    initialize: (config: any) => void
    render: (id: string, text: string) => Promise<{ svg: string }>
  }
  export default mermaid
}

declare module '@antv/infographic' {
  export const Infographic: any
  export function setDefaultFont(font: string): void
  export function setFontExtendFactor(factor: number): void
  export function exportToSVG(...args: any[]): any
}
