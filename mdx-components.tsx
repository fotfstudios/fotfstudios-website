/**
 * @next/mdx aliasea `next-mdx-import-source-file` a ESTE archivo, en la raíz del repo.
 * El mapa real vive en components/mdx/ porque los contract tests escanean components/**
 * y app/**, nunca la raíz — acá no lo verían.
 */
export { useMDXComponents } from "@/components/mdx/mdx-components";
