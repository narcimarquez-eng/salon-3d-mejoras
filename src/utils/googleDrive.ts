export interface GoogleDriveGlbFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

export async function listGlbFilesFromDrive(
  accessToken: string | null
): Promise<GoogleDriveGlbFile[]> {
  if (!accessToken) return [];
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        "name contains '.glb' and trashed = false"
      )}&fields=files(id,name,size,modifiedTime,thumbnailLink,webViewLink)&pageSize=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Error de Google Drive API: ${res.statusText}`);
    return (await res.json()).files || [];
  } catch (err) {
    console.error('Error listando archivos de Drive:', err);
    throw err;
  }
}

export async function downloadGlbFileFromDrive(
  fileId: string,
  fileName: string,
  accessToken: string
): Promise<File> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Error descargando archivo de Drive: ${res.statusText}`);
  const blob = await res.blob();
  return new File([blob], fileName || `drive_model_${fileId}.glb`, {
    type: 'model/gltf-binary',
  });
}
