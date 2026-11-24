import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiAuth } from '@/lib/auth/rbac';
import {
  CATEGORY_TO_SUBFOLDER,
  JobDriveCategory,
  ensureJobDriveStructure,
  extractDriveFolderId,
  isGoogleDriveConfigured,
  listJobDriveFiles,
  uploadFileToDrive,
} from '@/lib/google/drive';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'accounting',
    'warehouse',
    'install_coordinator',
  ]);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, job_number, project_name, google_drive_folder_url')
      .eq('id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const configured = isGoogleDriveConfigured();
    const folderId = extractDriveFolderId(job.google_drive_folder_url);

    if (!configured || !folderId) {
      return NextResponse.json({
        configured,
        folderUrl: job.google_drive_folder_url || null,
        files: [],
      });
    }

    const files = await listJobDriveFiles(folderId);
    return NextResponse.json({
      configured: true,
      folderUrl: job.google_drive_folder_url,
      files,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load Google Drive files' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'install_coordinator',
  ]);
  if (errorResponse) return errorResponse;

  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Drive API is not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_DRIVE_ROOT_FOLDER_ID in environment variables.',
        },
        { status: 400 }
      );
    }

    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, job_number, project_name, google_drive_folder_url')
      .eq('id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const contentType = request.headers.get('content-type') || '';

    const structure = await ensureJobDriveStructure({
      jobNumber: job.job_number,
      projectName: job.project_name,
      existingFolderUrl: job.google_drive_folder_url,
    });

    if (job.google_drive_folder_url !== structure.folderUrl) {
      await supabase
        .from('jobs')
        .update({
          google_drive_folder_url: structure.folderUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const categoryRaw = (formData.get('category') as string | null) || 'contracts';
      const category: JobDriveCategory =
        categoryRaw in CATEGORY_TO_SUBFOLDER
          ? (categoryRaw as JobDriveCategory)
          : 'contracts';

      if (!file || !file.name) {
        return NextResponse.json({ error: 'File is required' }, { status: 400 });
      }

      const targetSubfolderName = CATEGORY_TO_SUBFOLDER[category];
      const targetFolderId = structure.subfolders[targetSubfolderName] || structure.folderId;
      const buffer = Buffer.from(await file.arrayBuffer());

      const uploaded = await uploadFileToDrive({
        folderId: targetFolderId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        buffer,
      });

      const files = await listJobDriveFiles(structure.folderId);
      return NextResponse.json({
        folderUrl: structure.folderUrl,
        uploaded,
        files,
      });
    }

    const files = await listJobDriveFiles(structure.folderId);
    return NextResponse.json({
      folderUrl: structure.folderUrl,
      subfolders: structure.subfolders,
      files,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Google Drive action failed' },
      { status: 500 }
    );
  }
}
