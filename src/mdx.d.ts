declare module "*.mdx" {
  import type { ComponentType, ReactNode } from "react";

  type MdxComponentOverrides = Record<
    string,
    ComponentType<{ children?: ReactNode }>
  >;

  const MDXComponent: ComponentType<{ components?: MdxComponentOverrides }>;
  export default MDXComponent;
}
