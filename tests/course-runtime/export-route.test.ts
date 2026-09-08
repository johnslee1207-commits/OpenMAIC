import { afterEach, describe, expect, test, vi } from 'vitest';

import { handleCourseRuntimeExport } from '@/lib/course-runtime/export-route';
import { readClassroom } from '@/lib/server/classroom-storage';

vi.mock('@/lib/server/classroom-storage', () => ({
  readClassroom: vi.fn(),
}));

const document = {
  stage: {
    id: 'course-1',
    name: 'Course One',
    description: 'Persistence backed course',
    createdAt: 0,
    updatedAt: 0,
  },
  scenes: [
    {
      id: 'scene-1',
      stageId: 'course-1',
      title: 'Intro',
      order: 0,
      type: 'slide',
      content: {
        type: 'slide',
        canvas: {
          id: 'slide-1',
          elements: [{ type: 'text', content: '<p>Hello from persistence.</p>' }],
        },
      },
    },
  ],
};

describe('course runtime export route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test('falls back from classroom file store to persistence document store', async () => {
    vi.mocked(readClassroom).mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(document), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleCourseRuntimeExport(
      new Request('http://openmaic.local/api/export/html', {
        method: 'POST',
        headers: { cookie: 'anonymous_id=abc' },
        body: JSON.stringify({ stageId: 'course-1', format: 'html', version: '1.0.0' }),
      }) as never,
      'html',
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Hello from persistence');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://openmaic.local/api/persistence/documents/course-1'),
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('cookie')).toBe('anonymous_id=abc');
  });
});
