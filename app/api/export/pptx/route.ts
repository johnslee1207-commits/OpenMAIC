import type { NextRequest } from 'next/server';

import {
  buildCourseRuntimeExportArtifact,
  resolveCourseRuntimeStageId,
  type CourseRuntimeExportRequest,
} from '@/lib/course-runtime/export-service';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { readClassroom } from '@/lib/server/classroom-storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as CourseRuntimeExportRequest;
    const stageId = resolveCourseRuntimeStageId(body);
    const document = await readClassroom(stageId);
    if (!document) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }
    const artifact = await buildCourseRuntimeExportArtifact(document, { ...body, format: 'pptx' });
    return new Response(artifact.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': artifact.contentType,
        'content-disposition': `attachment; filename="${artifact.fileName}"`,
        'x-artifact-id': artifact.artifactId,
        'content-length': String(artifact.bytes.length),
      },
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      error instanceof Error ? error.message : 'Invalid export request',
    );
  }
}
