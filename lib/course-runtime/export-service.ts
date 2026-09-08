import JSZip from 'jszip';
import pptxgen from 'pptxgenjs';

import type { Scene, Stage } from '@/lib/types/stage';

export type CourseRuntimeExportFormat = 'html' | 'pptx' | 'maic-zip';

export interface CourseRuntimeExportRequest {
  stageId?: string;
  courseId?: string;
  version?: string;
  format?: string;
  profile?: Record<string, unknown>;
}

export interface CourseRuntimeClassroomDocument {
  id?: string;
  stage: Stage;
  scenes: Scene[];
  createdAt?: string;
}

export interface CourseRuntimeExportArtifact {
  artifactId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

export function resolveCourseRuntimeStageId(body: CourseRuntimeExportRequest): string {
  const stageId = String(body.stageId || body.courseId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(stageId)) {
    throw new Error('stageId or courseId is required and must be a safe OpenMAIC classroom id');
  }
  return stageId;
}

export async function buildCourseRuntimeExportArtifact(
  document: CourseRuntimeClassroomDocument,
  request: CourseRuntimeExportRequest,
): Promise<CourseRuntimeExportArtifact> {
  const format = normalizeFormat(request.format);
  if (format === 'pptx') return buildPptxArtifact(document, request);
  if (format === 'maic-zip') return buildMaicZipArtifact(document, request);
  return buildHtmlArtifact(document, request);
}

export function normalizeFormat(value: unknown): CourseRuntimeExportFormat {
  const format = String(value || 'html')
    .trim()
    .toLowerCase();
  if (format === 'pptx' || format === 'html' || format === 'maic-zip') return format;
  throw new Error(`unsupported export format: ${format}`);
}

export function buildOpenMaicCourseHtml(document: CourseRuntimeClassroomDocument): string {
  const title = document.stage.name || document.stage.id || 'OpenMAIC course';
  const scenes = [...document.scenes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return `<!doctype html>
<html lang="${escapeAttr(document.stage.languageDirective || 'en')}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - OpenMAIC</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Segoe UI", Arial, sans-serif; }
    body { margin: 0; color: #172033; background: #f6f8fb; }
    header { padding: 28px 40px 20px; background: #ffffff; border-bottom: 1px solid #dce3ee; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
    main { max-width: 1120px; margin: 0 auto; padding: 28px 24px 48px; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    nav button { border: 1px solid #cdd7e5; background: #fff; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
    nav button[aria-selected="true"] { background: #1f6feb; color: #fff; border-color: #1f6feb; }
    section.scene { display: none; background: #fff; border: 1px solid #dce3ee; border-radius: 8px; padding: 28px; }
    section.scene.active { display: block; }
    h2 { margin: 0 0 18px; font-size: 22px; line-height: 1.3; }
    .content { font-size: 16px; line-height: 1.65; }
    .quiz-question { border-top: 1px solid #edf1f7; padding-top: 18px; margin-top: 18px; }
    .option { display: flex; align-items: flex-start; gap: 10px; margin: 10px 0; padding: 10px 12px; border: 1px solid #dce3ee; border-radius: 6px; }
    .analysis { margin-top: 12px; padding: 12px; border-radius: 6px; background: #eef6ff; color: #174b7a; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f4f6f9; padding: 14px; border-radius: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div>${escapeHtml(document.stage.description || '')}</div>
  </header>
  <main>
    <nav aria-label="Scenes">
      ${scenes
        .map(
          (scene, index) =>
            `<button type="button" data-scene-tab="${index}" aria-selected="${index === 0}">${escapeHtml(scene.title || `Scene ${index + 1}`)}</button>`,
        )
        .join('\n      ')}
    </nav>
    ${scenes.map((scene, index) => renderScene(scene, index)).join('\n    ')}
  </main>
  <script>
    const tabs = [...document.querySelectorAll('[data-scene-tab]')];
    const scenes = [...document.querySelectorAll('[data-scene-panel]')];
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const index = tab.getAttribute('data-scene-tab');
        for (const item of tabs) item.setAttribute('aria-selected', String(item === tab));
        for (const panel of scenes) panel.classList.toggle('active', panel.getAttribute('data-scene-panel') === index);
      });
    }
  </script>
</body>
</html>`;
}

async function buildHtmlArtifact(
  document: CourseRuntimeClassroomDocument,
  request: CourseRuntimeExportRequest,
): Promise<CourseRuntimeExportArtifact> {
  const html = buildOpenMaicCourseHtml(document);
  const fileName = `${safeFileName(document.stage.name || document.stage.id || 'course')}.html`;
  return artifact(
    document,
    request,
    'html',
    fileName,
    'text/html; charset=utf-8',
    Buffer.from(html),
  );
}

async function buildMaicZipArtifact(
  document: CourseRuntimeClassroomDocument,
  request: CourseRuntimeExportRequest,
): Promise<CourseRuntimeExportArtifact> {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        formatVersion: 'openmaic-course-runtime-1',
        exportedAt: new Date().toISOString(),
        appVersion: process.env.npm_package_version || '0.0.0',
        stage: document.stage,
        scenes: document.scenes,
      },
      null,
      2,
    ),
  );
  zip.file('index.html', buildOpenMaicCourseHtml(document));
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const fileName = `${safeFileName(document.stage.name || document.stage.id || 'course')}.maic.zip`;
  return artifact(document, request, 'maic-zip', fileName, 'application/zip', bytes);
}

async function buildPptxArtifact(
  document: CourseRuntimeClassroomDocument,
  request: CourseRuntimeExportRequest,
): Promise<CourseRuntimeExportArtifact> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenMAIC';
  pptx.subject = document.stage.description || document.stage.name || document.stage.id;
  pptx.title = document.stage.name || document.stage.id || 'OpenMAIC course';
  for (const scene of [...document.scenes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const slide = pptx.addSlide();
    slide.background = { color: 'F7FAFC' };
    slide.addText(scene.title || 'Untitled scene', {
      x: 0.55,
      y: 0.35,
      w: 12.2,
      h: 0.5,
      fontFace: 'Aptos Display',
      fontSize: 24,
      bold: true,
      color: '172033',
      margin: 0,
    });
    slide.addText(sceneSummary(scene), {
      x: 0.65,
      y: 1.05,
      w: 12.0,
      h: 5.9,
      fontFace: 'Aptos',
      fontSize: 14,
      color: '263445',
      breakLine: false,
      valign: 'top',
      fit: 'shrink',
      margin: 0.08,
    });
  }
  const buffer = Buffer.from((await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer);
  const fileName = `${safeFileName(document.stage.name || document.stage.id || 'course')}.pptx`;
  return artifact(
    document,
    request,
    'pptx',
    fileName,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer,
  );
}

function artifact(
  document: CourseRuntimeClassroomDocument,
  request: CourseRuntimeExportRequest,
  format: CourseRuntimeExportFormat,
  fileName: string,
  contentType: string,
  bytes: Buffer,
): CourseRuntimeExportArtifact {
  const version = String(request.version || 'draft');
  return {
    artifactId: stableId(`${document.stage.id}:${version}:${format}:${bytes.length}`),
    fileName,
    contentType,
    bytes,
  };
}

function renderScene(scene: Scene, index: number): string {
  return `<section class="scene${index === 0 ? ' active' : ''}" data-scene-panel="${index}">
      <h2>${escapeHtml(scene.title || `Scene ${index + 1}`)}</h2>
      <div class="content">${renderSceneContent(scene)}</div>
    </section>`;
}

function renderSceneContent(scene: Scene): string {
  if (scene.content?.type === 'interactive' && 'html' in scene.content && scene.content.html) {
    return `<iframe title="${escapeAttr(scene.title || 'interactive')}" sandbox="allow-scripts allow-forms" srcdoc="${escapeAttr(scene.content.html)}" style="width:100%;height:620px;border:1px solid #dce3ee;border-radius:6px;background:#fff"></iframe>`;
  }
  if (scene.content?.type === 'quiz') return renderQuiz(scene);
  return `<pre>${escapeHtml(sceneSummary(scene))}</pre>`;
}

function renderQuiz(scene: Scene): string {
  const content = scene.content as unknown as Record<string, unknown>;
  const questions = Array.isArray(content.questions) ? content.questions : [];
  return questions
    .map((question: unknown, questionIndex: number) => {
      const q = question as Record<string, unknown>;
      const id = String(q.id || `${scene.id}-q${questionIndex + 1}`);
      const options = Array.isArray(q.options) ? q.options : [];
      return `<div class="quiz-question">
        <strong>${escapeHtml(String(q.question || q.prompt || `Question ${questionIndex + 1}`))}</strong>
        ${options
          .map((option, optionIndex) => {
            const item = option as Record<string, unknown>;
            const value = String(item.value || `${id}::${optionIndex}`);
            const label = String(
              item.label || item.text || item.value || `Option ${optionIndex + 1}`,
            );
            return `<label class="option"><input type="radio" name="${escapeAttr(id)}" value="${escapeAttr(value)}" /> <span>${escapeHtml(label)}</span></label>`;
          })
          .join('')}
        ${q.analysis ? `<div class="analysis">${escapeHtml(String(q.analysis))}</div>` : ''}
      </div>`;
    })
    .join('');
}

function sceneSummary(scene: Scene): string {
  const parts = [scene.title || 'Untitled scene'];
  if (scene.content?.type === 'quiz') {
    const content = scene.content as unknown as Record<string, unknown>;
    const questions = Array.isArray(content.questions) ? content.questions : [];
    for (const question of questions) {
      const q = question as Record<string, unknown>;
      parts.push(String(q.question || q.prompt || 'Quiz question'));
      if (Array.isArray(q.options)) {
        parts.push(
          ...q.options.map((option) => {
            const item = option as Record<string, unknown>;
            return `- ${String(item.label || item.text || item.value || option)}`;
          }),
        );
      }
      if (q.analysis) parts.push(`Explanation: ${String(q.analysis)}`);
    }
  } else if (scene.content?.type === 'slide') {
    const canvas = (scene.content as unknown as Record<string, unknown>).canvas as
      | { elements?: Array<Record<string, unknown>> }
      | undefined;
    for (const element of canvas?.elements || []) {
      if (typeof element.content === 'string') parts.push(stripHtml(element.content));
      else if (typeof element.text === 'string') parts.push(stripHtml(element.text));
    }
  } else if (scene.content?.type === 'pbl') {
    const content = scene.content as unknown as Record<string, unknown>;
    parts.push(JSON.stringify(content.project || content.projectV2 || content, null, 2));
  }
  return parts.filter(Boolean).join('\n\n');
}

function stableId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `openmaic-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'course';
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
