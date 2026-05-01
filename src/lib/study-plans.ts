import { LearningBlock, StudyPlan } from "@/types/learning-block";

const STORAGE_KEY = "exam-learning-tracker.plans";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StudyPlanFormValue = {
  subject: string;
  examName: string;
  startDate: string;
  examDate: string;
  totalBlocks: string;
  selectedWeekdays: number[];
  includeWeekends: boolean;
  blockPrefix: string;
};

export type GeneratedStudyBlock = {
  date: string;
  subject: string;
  topic: string;
  examName?: string;
  generatedPlanId: string;
  blockNumber: number;
  itemType: "learning";
};

export type StudyPlanPreview = {
  validStudyDaysAvailable: number;
  calendarDaysAvailable: number;
  requiredStudyDays: number;
  bufferDays: number;
  fits: boolean;
  warnings: string[];
  schedule: GeneratedStudyBlock[];
  blockedDates: string[];
};

export type StudyPlanStats = {
  planId: string;
  label: string;
  examDate: string;
  totalBlocks: number;
  completedBlocks: number;
  remainingBlocks: number;
  validStudyDaysRemaining: number;
  bufferDaysRemaining: number;
  behindBy: number;
  fits: boolean;
};

export type RescheduleResult = {
  blocks: LearningBlock[];
  warnings: string[];
  shiftedCount: number;
};

export function loadStudyPlans(): StudyPlan[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawPlans = window.localStorage.getItem(STORAGE_KEY);
    if (!rawPlans) {
      return [];
    }

    const plans = JSON.parse(rawPlans);
    if (!Array.isArray(plans)) {
      return [];
    }

    return plans.filter(isStudyPlan).map((plan) => ({
      ...plan,
      removedDates: Array.isArray(plan.removedDates) ? plan.removedDates : [],
    }));
  } catch {
    return [];
  }
}

export function saveStudyPlans(plans: StudyPlan[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export function createStudyPlan(form: StudyPlanFormValue): StudyPlan {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    subject: form.subject.trim(),
    examName: cleanOptional(form.examName),
    startDate: form.startDate,
    examDate: form.examDate,
    totalBlocks: Number(form.totalBlocks),
    selectedWeekdays: uniqueWeekdays(form.selectedWeekdays),
    includeWeekends: form.includeWeekends,
    blockPrefix: cleanPrefix(form.blockPrefix),
    removedDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildStudyPlanPreview(
  form: StudyPlanFormValue,
  existingBlocks: LearningBlock[],
): StudyPlanPreview {
  const start = parseLocalDate(form.startDate);
  const exam = parseLocalDate(form.examDate);
  const totalBlocks = normalizeTotalBlocks(form.totalBlocks);
  const selectedDays = normalizeSelectedDays(form.selectedWeekdays, form.includeWeekends);
  const occupiedDates = new Set(existingBlocks.map((block) => block.date));
  const warnings: string[] = [];

  if (!form.startDate || !form.examDate) {
    return emptyPreview(totalBlocks, warnings, occupiedDates);
  }

  if (Number.isNaN(start.getTime()) || Number.isNaN(exam.getTime())) {
    warnings.push("Choose valid start and exam dates.");
    return emptyPreview(totalBlocks, warnings, occupiedDates);
  }

  if (exam <= start) {
    warnings.push("The exam date must be after the start date.");
  }

  if (!form.subject.trim()) {
    warnings.push("Enter a subject or exam name.");
  }

  const allCalendarDays = listCalendarDays(start, exam);
  const validStudyDates = allCalendarDays.filter((date) => isAllowedPlanDate(date, selectedDays, []));
  const freeStudyDates = validStudyDates.filter((date) => !occupiedDates.has(date));
  const validStudyDaysAvailable = freeStudyDates.length;
  const calendarDaysAvailable = Math.max(0, diffInDays(start, exam));
  const bufferDays = validStudyDaysAvailable - totalBlocks;
  const fits =
    totalBlocks > 0 &&
    bufferDays >= 0 &&
    warnings.length === 0 &&
    selectedDays.length > 0 &&
    Boolean(form.subject.trim());

  if (totalBlocks <= 0) {
    warnings.push("Total blocks must be greater than zero.");
  }

  if (selectedDays.length === 0) {
    warnings.push("Select at least one weekday for the study plan.");
  }

  if (bufferDays < 0) {
    warnings.push(
      "This plan does not fit before the exam date. Add more study weekdays, include weekends, reduce the number of blocks, or move the start date earlier.",
    );
  }

  const schedule = freeStudyDates.slice(0, Math.max(0, totalBlocks)).map((date, index) => {
    const blockNumber = index + 1;
    return {
      date,
      subject: form.subject.trim(),
      topic: `${cleanPrefix(form.blockPrefix)} ${blockNumber}`,
      examName: cleanOptional(form.examName),
      generatedPlanId: "",
      blockNumber,
      itemType: "learning" as const,
    };
  });

  return {
    validStudyDaysAvailable,
    calendarDaysAvailable,
    requiredStudyDays: totalBlocks,
    bufferDays,
    fits,
    warnings,
    schedule,
    blockedDates: Array.from(occupiedDates),
  };
}

export function createGeneratedBlocks(plan: StudyPlan, schedule: StudyPlanPreview["schedule"]): LearningBlock[] {
  const now = new Date().toISOString();

  return schedule.map((entry) => ({
    id: crypto.randomUUID(),
    date: entry.date,
    subject: plan.subject,
    topic: entry.topic,
    description: `Auto-generated from ${plan.subject}`,
    examName: plan.examName,
    learned: false,
    repeated: false,
    testDone: false,
    confidence: undefined,
    notes: "",
    generatedPlanId: plan.id,
    blockNumber: entry.blockNumber,
    isGenerated: true,
    itemType: "learning",
    createdAt: now,
    updatedAt: now,
  }));
}

export function getStudyPlanName(plan: StudyPlan) {
  return plan.examName?.trim() || plan.subject;
}

export function getPlanBlocks(blocks: LearningBlock[], planId: string) {
  return blocks
    .filter((block) => block.generatedPlanId === planId)
    .sort(comparePlanBlocks);
}

export function getPlanStats(plan: StudyPlan, blocks: LearningBlock[], today = getTodayDate()): StudyPlanStats {
  const originalLearningBlocks = getOriginalLearningBlocks(blocks, plan.id);
  const totalBlocks = originalLearningBlocks.length;
  const completedBlocks = originalLearningBlocks.filter(isBlockCompleted).length;
  const remainingBlocks = originalLearningBlocks.filter((block) => !isBlockCompleted(block)).length;
  const selectedDays = normalizeSelectedDays(plan.selectedWeekdays, plan.includeWeekends);
  const validStudyDaysRemaining = listCalendarDays(parseLocalDate(today), parseLocalDate(plan.examDate)).filter(
    (date) => isAllowedPlanDate(date, selectedDays, plan.removedDates ?? []),
  ).length;
  const reservedFutureDates = new Set(
    getPlanBlocks(blocks, plan.id)
      .filter((block) => block.date >= today && block.date < plan.examDate)
      .filter((block) => block.itemType === "review" || isBlockCompleted(block))
      .map((block) => block.date),
  );
  const bufferDaysRemaining = validStudyDaysRemaining - remainingBlocks - reservedFutureDates.size;
  return {
    planId: plan.id,
    label: getStudyPlanName(plan),
    examDate: plan.examDate,
    totalBlocks,
    completedBlocks,
    remainingBlocks,
    validStudyDaysRemaining,
    bufferDaysRemaining,
    behindBy: bufferDaysRemaining < 0 ? Math.abs(bufferDaysRemaining) : 0,
    fits: bufferDaysRemaining >= 0,
  };
}

export function markPlanDateRemoved(
  plan: StudyPlan,
  blocks: LearningBlock[],
  removedDate: string,
): { plan: StudyPlan; result: RescheduleResult } {
  const removedDates = uniqueDates((plan.removedDates ?? []).concat(removedDate));
  const updatedPlan: StudyPlan = {
    ...plan,
    removedDates,
    updatedAt: new Date().toISOString(),
  };
  const result = reschedulePlanFromDate({
    blocks,
    plan: updatedPlan,
    pivotDate: removedDate,
  });
  return { plan: updatedPlan, result };
}

export function clearPlanDateRemoved(plan: StudyPlan, removedDate: string): StudyPlan {
  return {
    ...plan,
    removedDates: (plan.removedDates ?? []).filter((date) => date !== removedDate),
    updatedAt: new Date().toISOString(),
  };
}

export function markBlockNotDone(blocks: LearningBlock[], blockId: string) {
  return blocks.map((block) =>
    block.id === blockId
      ? {
          ...block,
          learned: false,
          repeated: false,
          testDone: false,
          updatedAt: new Date().toISOString(),
        }
      : block,
  );
}

export function addReviewDay(params: {
  plan: StudyPlan;
  blocks: LearningBlock[];
  sourceBlock: LearningBlock;
  reviewDate?: string;
}): RescheduleResult {
  const { plan, blocks, sourceBlock, reviewDate } = params;
  const now = new Date().toISOString();
  const planBlocks = getPlanBlocks(blocks, plan.id);
  const maxBlockNumber = planBlocks.reduce((max, block) => Math.max(max, block.blockNumber ?? 0), 0);
  const requestedDate = reviewDate ?? findNextAvailablePlanDate(plan, blocks, sourceBlock.date);

  if (!requestedDate || !canUseAsBufferDay(plan, blocks, requestedDate)) {
    return {
      blocks,
      warnings: ["Choose a valid free buffer day before the exam date for this review block."],
      shiftedCount: 0,
    };
  }

  const reviewBlock: LearningBlock = {
    id: crypto.randomUUID(),
    date: requestedDate,
    subject: sourceBlock.subject,
    topic: sourceBlock.topic,
    description: `Review day for ${sourceBlock.topic}`,
    examName: sourceBlock.examName,
    learned: false,
    repeated: false,
    testDone: false,
    confidence: undefined,
    notes: "",
    generatedPlanId: plan.id,
    blockNumber: maxBlockNumber + 1,
    isGenerated: true,
    itemType: "review",
    originalBlockId: sourceBlock.id,
    createdAt: now,
    updatedAt: now,
  };

  return {
    blocks: blocks.concat(reviewBlock),
    warnings: [],
    shiftedCount: 0,
  };
}

export function reschedulePlanFromDate(params: {
  blocks: LearningBlock[];
  plan: StudyPlan;
  pivotDate: string;
  includePivotDate?: boolean;
}): RescheduleResult {
  const { blocks, plan, pivotDate, includePivotDate = false } = params;
  const warnings: string[] = [];
  const planBlocks = getPlanBlocks(blocks, plan.id);
  const updatedBlocks = blocks.map((block) => ({ ...block }));
  const selectedDays = normalizeSelectedDays(plan.selectedWeekdays, plan.includeWeekends);
  const removedDates = plan.removedDates ?? [];

  const fixedDates = new Set(
    planBlocks
      .filter((block) => isBlockCompleted(block) || block.itemType === "review" || block.date < pivotDate)
      .map((block) => block.date),
  );

  const otherPlanDates = new Set(
    planBlocks
      .filter((block) => block.date < pivotDate && !isBlockCompleted(block) && block.itemType !== "review")
      .map((block) => block.date),
  );

  let cursor = pivotDate;
  let shiftedCount = 0;

  for (const planBlock of planBlocks) {
    const shouldKeepFixed =
      isBlockCompleted(planBlock) || planBlock.itemType === "review" || planBlock.date < pivotDate;
    if (shouldKeepFixed) {
      continue;
    }

    const nextDate = findNextAvailableStudyDay({
      afterDate: cursor,
      plan,
      occupied: new Set(Array.from(fixedDates).concat(Array.from(otherPlanDates))),
      selectedDays,
      removedDates,
      includeCurrentDate:
        includePivotDate ||
        isRemovedDateOrBlocked(planBlock.date, removedDates) ||
        planBlock.date === pivotDate,
    });

    if (!nextDate) {
      warnings.push("Some unfinished items could not be rescheduled before the exam date.");
      continue;
    }

    const target = updatedBlocks.find((block) => block.id === planBlock.id);
    if (target) {
      if (target.date !== nextDate) {
        shiftedCount += 1;
      }
      target.date = nextDate;
      target.updatedAt = new Date().toISOString();
    }
    fixedDates.add(nextDate);
    cursor = nextDate;
  }

  return {
    blocks: updatedBlocks,
    warnings,
    shiftedCount,
  };
}

export function findNextAvailablePlanDate(plan: StudyPlan, blocks: LearningBlock[], afterDate: string) {
  return findNextAvailableStudyDay({
    afterDate,
    plan,
    occupied: new Set(getPlanBlocks(blocks, plan.id).map((block) => block.date)),
    selectedDays: normalizeSelectedDays(plan.selectedWeekdays, plan.includeWeekends),
    removedDates: plan.removedDates ?? [],
    includeCurrentDate: false,
  });
}

export function isDateSchedulable(plan: StudyPlan, blocks: LearningBlock[], date: string) {
  const selectedDays = normalizeSelectedDays(plan.selectedWeekdays, plan.includeWeekends);
  if (!isAllowedPlanDate(date, selectedDays, plan.removedDates ?? [])) {
    return false;
  }
  return !getPlanBlocks(blocks, plan.id).some((block) => block.date === date);
}

export function isRemovedDate(plan: StudyPlan, date: string) {
  return (plan.removedDates ?? []).includes(date);
}

export function canUseAsBufferDay(plan: StudyPlan, blocks: LearningBlock[], date: string) {
  if (date >= plan.examDate) {
    return false;
  }
  const selectedDays = normalizeSelectedDays(plan.selectedWeekdays, plan.includeWeekends);
  if (!isAllowedPlanDate(date, selectedDays, plan.removedDates ?? [])) {
    return false;
  }
  return !getPlanBlocks(blocks, plan.id).some((block) => block.date === date);
}

export function getOriginalLearningBlocks(blocks: LearningBlock[], planId: string) {
  return getPlanBlocks(blocks, planId).filter((block) => block.itemType !== "review");
}

export function getReviewBlocksForOriginal(blocks: LearningBlock[], originalBlockId: string) {
  return blocks
    .filter((block) => block.itemType === "review" && block.originalBlockId === originalBlockId)
    .sort(comparePlanBlocks);
}

export function getLearnedRepeatedCount(blocks: LearningBlock[]) {
  return blocks.filter((block) => block.learned || block.repeated).length;
}

export function getTestDoneCount(blocks: LearningBlock[]) {
  return blocks.filter((block) => block.testDone).length;
}

function emptyPreview(
  totalBlocks: number,
  warnings: string[],
  occupiedDates: Set<string>,
): StudyPlanPreview {
  return {
    validStudyDaysAvailable: 0,
    calendarDaysAvailable: 0,
    requiredStudyDays: totalBlocks,
    bufferDays: -totalBlocks,
    fits: false,
    warnings,
    schedule: [],
    blockedDates: Array.from(occupiedDates),
  };
}

function comparePlanBlocks(a: LearningBlock, b: LearningBlock) {
  return (
    Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0) ||
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

function cleanOptional(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cleanPrefix(value: string) {
  const trimmed = value.trim();
  return trimmed || "Block";
}

function normalizeTotalBlocks(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function uniqueWeekdays(selectedWeekdays: number[]) {
  return Array.from(new Set(selectedWeekdays)).sort((a, b) => a - b);
}

function normalizeSelectedDays(selectedWeekdays: number[], includeWeekends: boolean) {
  const weekdays = includeWeekends
    ? selectedWeekdays
    : selectedWeekdays.filter((day) => day !== 0 && day !== 6);
  return uniqueWeekdays(weekdays);
}

function uniqueDates(dates: string[]) {
  return Array.from(new Set(dates)).sort((a, b) => a.localeCompare(b));
}

function listCalendarDays(start: Date, exam: Date) {
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor < exam) {
    days.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isAllowedPlanDate(date: string, selectedDays: number[], removedDates: string[]) {
  const weekday = parseLocalDate(date).getDay();
  return selectedDays.includes(weekday) && !removedDates.includes(date);
}

function isRemovedDateOrBlocked(date: string, removedDates: string[]) {
  return removedDates.includes(date);
}

function parseLocalDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffInDays(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
}

function isStudyPlan(value: unknown): value is StudyPlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const plan = value as StudyPlan;
  return (
    typeof plan.id === "string" &&
    typeof plan.subject === "string" &&
    typeof plan.startDate === "string" &&
    typeof plan.examDate === "string" &&
    typeof plan.totalBlocks === "number" &&
    Array.isArray(plan.selectedWeekdays) &&
    typeof plan.includeWeekends === "boolean" &&
    typeof plan.blockPrefix === "string" &&
    typeof plan.createdAt === "string" &&
    typeof plan.updatedAt === "string" &&
    (plan.removedDates === undefined || Array.isArray(plan.removedDates))
  );
}

function isBlockCompleted(block: LearningBlock) {
  return block.learned || block.repeated || block.testDone;
}

function hasCompletedPlanItemOnDate(blocks: LearningBlock[], date: string) {
  return blocks.some((block) => block.date === date && isBlockCompleted(block));
}

function findNextAvailableStudyDay({
  afterDate,
  plan,
  occupied,
  selectedDays,
  removedDates,
  includeCurrentDate,
}: {
  afterDate: string;
  plan: StudyPlan;
  occupied: Set<string>;
  selectedDays: number[];
  removedDates: string[];
  includeCurrentDate: boolean;
}) {
  const exam = parseLocalDate(plan.examDate);
  const cursor = parseLocalDate(afterDate);
  if (!includeCurrentDate) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cursor < exam) {
    const candidate = formatLocalDate(cursor);
    const weekday = cursor.getDay();
    if (selectedDays.includes(weekday) && !occupied.has(candidate) && !removedDates.includes(candidate)) {
      return candidate;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return undefined;
}

function getTodayDate() {
  return formatLocalDate(new Date());
}
