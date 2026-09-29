/** Préfixe les fichiers publics lorsque l'application est publiée dans un sous-dossier GitHub Pages. */
export function publicAsset(path: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalizedPath}`;
}
