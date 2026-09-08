import type { NextRequest } from 'next/server';

import {
  buildCourseRuntimeExportArtifact,
  resolveCourseRuntimeStageId,
  type CourseRuntimeClassroomDocument,
  type CourseRuntimeExportFormat,
  type CourseRuntimeExportRequest,
} from '@/lib/course-runtime/export-service';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { readClassroom } from '@/lib/server/classroom-storage';

export async function handleCourseRuntimeExport(
  request: NextRequest,
  format: CourseRuntimeExportFormat,
): Promise<Response> {
  try {
    const body = (await request.json()) as CourseRuntimeExportRequest;
    const stageId = resolveCourseRuntimeStageId(body);
    const document = await readCourseRuntimeDocument(request, stageId);
    if (!document) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }
    const artifact = await buildCourseRuntimeExportArtifact(document, { ...body, format });
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

export async function readCourseRuntimeDocument(
  request: NextRequest,
  stageId: string,
): Promise<CourseRuntimeClassroomDocument | null> {
  const classroom = await readClassroom(stageId);
  if (classroom) return classroom;

  const persistence = await fetchPersistenceDocument(request, stageId);
  if (persistence) {
    return {
      id: stageId,
      stage: persistence.stage,
      scenes: persistence.scenes,
    };
  }
  return null;
}

async function fetchPersistenceDocument(
  request: NextRequest,
  stageId: string,
): Promise<CourseRuntimeClassroomDocument | null> {
  const url = new URL(`/api/persistence/documents/${encodeURIComponent(stageId)}`, request.url);
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const owner = request.headers.get('x-openmaic-owner-id');
  if (owner) headers.set('x-openmaic-owner-id', owner);

  try {
    const response = await fetch(url, { headers, cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    if (!isDocumentPayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isDocumentPayload(value: unknown): value is CourseRuntimeClassroomDocument {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CourseRuntimeClassroomDocument>;
  return !!payload.stage && Array.isArray(payload.scenes);
}
