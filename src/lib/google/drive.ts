import crypto from 'crypto';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export const JOB_DRIVE_SUBFOLDERS = [
  '01 Contracts & POs',
  '02 Scope & Quotes',
  '03 Submittals & Shop Drawings',
  '04 Install Photos & Closeout',
] as const;

export type JobDriveCategory =
  | 'contracts'
  | 'scope'
  | 'submittals'
  | 'install_photos';

export const CATEGORY_TO_SUBFOLDER: Record<JobDriveCategory, string> = {
  contracts: '01 Contracts & POs',
  scope: '02 Scope & Quotes',
  submittals: '03 Submittals & Shop Drawings',
  install_photos: '04 Install Photos & Closeout',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  );
}

export function extractDriveFolderId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) return trimmed;
  return null;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getGoogleDriveAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
    );
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64UrlEncode(signer.sign(privateKey));
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description || tokenData.error || 'Failed to obtain Google Drive token'
    );
  }

  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000,
  };
  return cachedToken.token;
}

function escapeDriveQuery(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function findOrCreateFolder(
  name: string,
  parentId: string
): Promise<{ id: string; webViewLink: string }> {
  const token = await getGoogleDriveAccessToken();
  const safeName = name.replace(/[\/\\]/g, '-').trim();
  const q = `name = '${escapeDriveQuery(safeName)}' and '${escapeDriveQuery(
    parentId
  )}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const searchParams = new URLSearchParams({
    q,
    fields: 'files(id, name, webViewLink)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  const searchRes = await fetch(`${DRIVE_API_BASE}/files?${searchParams.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchJson = await searchRes.json();
  if (searchRes.ok && Array.isArray(searchJson.files) && searchJson.files.length > 0) {
    const existing = searchJson.files[0];
    return {
      id: existing.id,
      webViewLink:
        existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
    };
  }

  const createRes = await fetch(
    `${DRIVE_API_BASE}/files?supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    }
  );

  const created = await createRes.json();
  if (!createRes.ok || !created.id) {
    throw new Error(created?.error?.message || `Failed to create Drive folder "${safeName}"`);
  }

  return {
    id: created.id,
    webViewLink:
      created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

export async function ensureJobDriveStructure(params: {
  jobNumber?: string | null;
  projectName: string;
  existingFolderUrl?: string | null;
}): Promise<{
  folderId: string;
  folderUrl: string;
  subfolders: Record<string, string>;
}> {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootId) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured');
  }

  let folderId = extractDriveFolderId(params.existingFolderUrl);
  let folderUrl = params.existingFolderUrl?.trim() || '';

  if (!folderId) {
    const folderName = [
      params.jobNumber ? `[${params.jobNumber}]` : '',
      params.projectName || 'Job Folder',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 120);
    const created = await findOrCreateFolder(folderName, rootId);
    folderId = created.id;
    folderUrl = created.webViewLink;
  } else if (!folderUrl) {
    folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  }

  const subfolders: Record<string, string> = {};
  for (const subName of JOB_DRIVE_SUBFOLDERS) {
    const sub = await findOrCreateFolder(subName, folderId);
    subfolders[subName] = sub.id;
  }

  return { folderId, folderUrl, subfolders };
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  webViewLink: string;
  webContentLink: string | null;
  modifiedTime: string | null;
  folderName: string;
}

export async function listJobDriveFiles(rootFolderId: string): Promise<DriveFileItem[]> {
  const token = await getGoogleDriveAccessToken();

  const listChildren = async (parentId: string) => {
    const q = `'${escapeDriveQuery(parentId)}' in parents and trashed = false`;
    const sp = new URLSearchParams({
      q,
      fields: 'files(id, name, mimeType, size, webViewLink, webContentLink, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const res = await fetch(`${DRIVE_API_BASE}/files?${sp.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error?.message || 'Failed to list Google Drive files');
    }
    return Array.isArray(json.files) ? json.files : [];
  };

  const topChildren = await listChildren(rootFolderId);
  const results: DriveFileItem[] = [];
  const subFoldersToScan: Array<{ id: string; name: string }> = [];

  for (const f of topChildren) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      subFoldersToScan.push({ id: f.id, name: f.name });
    } else {
      results.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : null,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        webContentLink: f.webContentLink || null,
        modifiedTime: f.modifiedTime || null,
        folderName: 'Root',
      });
    }
  }

  const subLists = await Promise.all(
    subFoldersToScan.map(async (sf) => ({
      folderName: sf.name,
      files: await listChildren(sf.id),
    }))
  );

  for (const group of subLists) {
    for (const f of group.files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') continue;
      results.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : null,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        webContentLink: f.webContentLink || null,
        modifiedTime: f.modifiedTime || null,
        folderName: group.folderName,
      });
    }
  }

  return results;
}

export async function uploadFileToDrive(params: {
  folderId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{
  id: string;
  name: string;
  webViewLink: string;
  webContentLink: string | null;
  size: number;
}> {
  const token = await getGoogleDriveAccessToken();
  const boundary = `ppi_drive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const metadataPart = JSON.stringify({
    name: params.filename,
    parents: [params.folderId],
  });

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n--${boundary}\r\nContent-Type: ${
      params.mimeType || 'application/octet-stream'
    }\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const body = Buffer.concat([head, params.buffer, tail]);

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,webViewLink,webContentLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    }
  );

  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(json?.error?.message || 'Failed to upload file to Google Drive');
  }

  return {
    id: json.id,
    name: json.name || params.filename,
    webViewLink: json.webViewLink || `https://drive.google.com/file/d/${json.id}/view`,
    webContentLink: json.webContentLink || null,
    size: json.size ? Number(json.size) : params.buffer.length,
  };
}
