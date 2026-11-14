async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `${fallback} (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(text);
      return parsed.error || parsed.message || `${fallback} (HTTP ${res.status})`;
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export async function uploadBidDocument(
  bidId: string,
  file: File,
  category?: string
): Promise<any> {
  // 1. Request a signed upload URL so large files bypass the 4.5MB serverless body limit
  const urlRes = await fetch(`/api/bid-requests/${bidId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_upload_url',
      filename: file.name,
    }),
  });

  if (!urlRes.ok) {
    throw new Error(await readErrorMessage(urlRes, 'Failed to prepare file upload'));
  }

  const urlData = await urlRes.json();
  if (!urlData.signedUrl || !urlData.publicUrl) {
    throw new Error('Server did not return a signed upload URL');
  }

  // 2. Upload directly to Supabase Storage
  const uploadRes = await fetch(urlData.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(await readErrorMessage(uploadRes, 'Direct storage upload failed'));
  }

  // 3. Register the uploaded document on the bid record
  const regRes = await fetch(`/api/bid-requests/${bidId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register_document',
      filename: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      storageUrl: urlData.publicUrl,
      category,
    }),
  });

  if (!regRes.ok) {
    throw new Error(await readErrorMessage(regRes, 'Failed to register uploaded document'));
  }

  const regData = await regRes.json();
  return regData.document;
}
