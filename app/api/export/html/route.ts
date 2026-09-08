import type { NextRequest } from 'next/server';

import { handleCourseRuntimeExport } from '@/lib/course-runtime/export-route';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<Response> {
  return handleCourseRuntimeExport(request, 'html');
}
