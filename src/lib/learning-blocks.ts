import { LearningBlock, LearningBlockInput } from "@/types/learning-block";

const STORAGE_KEY = "exam-learning-tracker.blocks";

export function loadLearningBlocks(): LearningBlock[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawBlocks = window.localStorage.getItem(STORAGE_KEY);
    if (!rawBlocks) {
      return [];
    }

    const blocks = JSON.parse(rawBlocks);
    if (!Array.isArray(blocks)) {
      return [];
    }

    return blocks.filter(isLearningBlock);
  } catch {
    return [];
  }
}

export function saveLearningBlocks(blocks: LearningBlock[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

export function createLearningBlock(input: LearningBlockInput): LearningBlock {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    date: input.date,
    subject: input.subject.trim(),
    topic: input.topic.trim(),
    description: cleanOptional(input.description),
    examName: cleanOptional(input.examName),
    learned: false,
    repeated: false,
    testDone: false,
    confidence: input.confidence,
    notes: cleanOptional(input.notes),
    isGenerated: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateLearningBlock(
  block: LearningBlock,
  updates: Partial<Omit<LearningBlock, "id" | "createdAt">>,
): LearningBlock {
  return {
    ...block,
    ...updates,
    subject: updates.subject?.trim() ?? block.subject,
    topic: updates.topic?.trim() ?? block.topic,
    description:
      "description" in updates ? cleanOptional(updates.description) : block.description,
    examName: "examName" in updates ? cleanOptional(updates.examName) : block.examName,
    notes: "notes" in updates ? cleanOptional(updates.notes) : block.notes,
    updatedAt: new Date().toISOString(),
  };
}

export function getTodayDate() {
  return formatLocalDate(new Date());
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isLearningBlock(value: unknown): value is LearningBlock {
  if (!value || typeof value !== "object") {
    return false;
  }

  const block = value as LearningBlock;
  return (
    typeof block.id === "string" &&
    typeof block.date === "string" &&
    typeof block.subject === "string" &&
    typeof block.topic === "string" &&
    typeof block.learned === "boolean" &&
    typeof block.repeated === "boolean" &&
    typeof block.testDone === "boolean" &&
    typeof block.createdAt === "string" &&
    typeof block.updatedAt === "string" &&
    (block.isGenerated === undefined || typeof block.isGenerated === "boolean") &&
    (block.blockNumber === undefined || Number.isInteger(block.blockNumber)) &&
    (block.generatedPlanId === undefined || typeof block.generatedPlanId === "string") &&
    (block.itemType === undefined || block.itemType === "learning" || block.itemType === "review") &&
    (block.originalBlockId === undefined || typeof block.originalBlockId === "string")
  );
}
