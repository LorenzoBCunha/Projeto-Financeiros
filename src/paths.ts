export function fileUriForDirectory(directory:string):string {
  if (directory.startsWith('file://')) return directory;
  if (!directory.startsWith('/')) throw new Error('Diretório do banco inválido.');
  return `file://${encodeURI(directory)}`;
}
