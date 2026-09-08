import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import {
  buildCourseRuntimeExportArtifact,
  buildOpenMaicCourseHtml,
  type CourseRuntimeClassroomDocument,
} from '@/lib/course-runtime/export-service';

const document: CourseRuntimeClassroomDocument = {
  id: 'california-electrician-entrance',
  stage: {
    id: 'california-electrician-entrance',
    name: 'California Electrician Entrance Exam',
    description: 'Diagnostic lecture and practice course',
    createdAt: 0,
    updatedAt: 0,
  } as never,
  scenes: [
    {
      id: 'scene-quiz',
      stageId: 'california-electrician-entrance',
      title: 'Diagnostic Quiz',
      order: 0,
      type: 'quiz',
      content: {
        type: 'quiz',
        questions: [
          {
            id: 'q1',
            question: '3x - 4 = 20. What is x?',
            options: [
              { value: 'q1::A', label: '6' },
              { value: 'q1::B', label: '8' },
            ],
            analysis: 'Add 4 to both sides, then divide by 3.',
          },
          {
            id: 'q2',
            question: 'Which wire is grounded?',
            options: [
              { value: 'q2::A', label: 'White or gray' },
              { value: 'q2::B', label: 'Black' },
            ],
          },
        ],
      },
    },
  ] as never,
};

describe('course runtime export service', () => {
  test('renders quiz inputs with one radio group per question', () => {
    const html = buildOpenMaicCourseHtml(document);

    expect(html).toContain('name="q1" value="q1::B"');
    expect(html).toContain('name="q2" value="q2::A"');
    expect(html).toContain('Add 4 to both sides');
  });

  test('builds an OpenMAIC classroom zip with manifest and html', async () => {
    const artifact = await buildCourseRuntimeExportArtifact(document, {
      format: 'maic-zip',
      version: '1.0.0',
    });

    const zip = await JSZip.loadAsync(artifact.bytes);
    expect(artifact.fileName).toBe('California Electrician Entrance Exam.maic.zip');
    expect(zip.file('manifest.json')).toBeTruthy();
    expect(zip.file('index.html')).toBeTruthy();
  });

  test('builds pptx bytes server side', async () => {
    const artifact = await buildCourseRuntimeExportArtifact(document, {
      format: 'pptx',
      version: '1.0.0',
    });

    expect(artifact.contentType).toContain('presentationml.presentation');
    expect(artifact.fileName).toBe('California Electrician Entrance Exam.pptx');
    expect(artifact.bytes.length).toBeGreaterThan(1000);
  });
});
