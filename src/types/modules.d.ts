declare module "*.csv" {
  const content: string;
  export default content;
}

declare module "papaparse" {
  interface ParseResult<T> {
    data: T[];
    errors: unknown[];
    meta: unknown;
  }
  interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    delimiter?: string;
    [key: string]: unknown;
  }
  function parse<T = unknown>(input: string, config?: ParseConfig): ParseResult<T>;
  const Papa: { parse: typeof parse };
  export default Papa;
}

declare module "staticmaps" {
  interface StaticMapsOptions {
    width: number;
    height: number;
    tileUrl?: string;
    tileSize?: number;
    paddingX?: number;
    paddingY?: number;
    [key: string]: unknown;
  }
  interface MarkerOptions {
    coord: [number, number];
    img: string;
    width?: number;
    height?: number;
    offsetX?: number;
    offsetY?: number;
    [key: string]: unknown;
  }
  export default class StaticMaps {
    constructor(options: StaticMapsOptions);
    addMarker(options: MarkerOptions): void;
    addLine(options: Record<string, unknown>): void;
    addCircle(options: Record<string, unknown>): void;
    addText(options: Record<string, unknown>): void;
    render(center?: [number, number], zoom?: number): Promise<void>;
    image: {
      buffer(mime?: string, options?: Record<string, unknown>): Promise<Buffer>;
      save(path: string, options?: Record<string, unknown>): Promise<void>;
    };
  }
}
