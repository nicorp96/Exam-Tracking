"use client";

import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { NavTabs, ViewKey } from "@/components/NavTabs";
import { ItemBadge, SourceBadge, StatusBadge, BlockBadges } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import {
  createLearningBlock,
  formatDate,
  getTodayDate,
  loadLearningBlocks,
  saveLearningBlocks,
  updateLearningBlock,
} from "@/lib/learning-blocks";
import {
  addReviewDay,
  buildStudyPlanPreview,
  canUseAsBufferDay,
  clearPlanDateRemoved,
  createGeneratedBlocks,
  createStudyPlan,
  findNextAvailablePlanDate,
  getLearnedRepeatedCount,
  getOriginalLearningBlocks,
  getPlanStats,
  getStudyPlanName,
  getReviewBlocksForOriginal,
  getTestDoneCount,
  isDateSchedulable,
  loadStudyPlans,
  markBlockNotDone,
  markPlanDateRemoved,
  reschedulePlanFromDate,
  RescheduleResult,
  saveStudyPlans,
  StudyPlanFormValue,
} from "@/lib/study-plans";
import { LearningBlock, StudyPlan } from "@/types/learning-block";

type ManualFormState = {
  date: string;
  subject: string;
  topic: string;
  description: string;
  examName: string;
  notes: string;
  confidence: string;
};

type ProgressFormState = {
  learned: boolean;
  repeated: boolean;
  testDone: boolean;
  notes: string;
  confidence: string;
  shiftRemaining: boolean;
  reviewDate: string;
};

const weekdayOptions = [
  { day: 0, label: "Sunday" },
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
];

const emptyManualForm = (): ManualFormState => ({
  date: getTodayDate(),
  subject: "",
  topic: "",
  description: "",
  examName: "",
  notes: "",
  confidence: "",
});

const defaultGeneratorForm = (): StudyPlanFormValue => ({
  subject: "",
  examName: "",
  startDate: getTodayDate(),
  examDate: addDays(getTodayDate(), 30),
  totalBlocks: "20",
  selectedWeekdays: [1, 2, 3, 4, 5],
  includeWeekends: false,
  blockPrefix: "Block",
});

const emptyProgressForm = (): ProgressFormState => ({
  learned: false,
  repeated: false,
  testDone: false,
  notes: "",
  confidence: "",
  shiftRemaining: false,
  reviewDate: "",
});

export default function Page() {
  const [blocks, setBlocks] = useState<LearningBlock[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [manualForm, setManualForm] = useState<ManualFormState>(emptyManualForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [progressTarget, setProgressTarget] = useState<LearningBlock | null>(null);
  const [progressForm, setProgressForm] = useState<ProgressFormState>(emptyProgressForm());
  const [generatorForm, setGeneratorForm] = useState<StudyPlanFormValue>(defaultGeneratorForm());
  const [calendarMonth, setCalendarMonth] = useState(() => getTodayDate().slice(0, 7));
  const [message, setMessage] = useState<string | null>(null);
  const [bufferReviewDate, setBufferReviewDate] = useState<string | null>(null);
  const [bufferReviewPlanId, setBufferReviewPlanId] = useState<string>("");
  const [bufferReviewOriginalId, setBufferReviewOriginalId] = useState<string>("");

  useEffect(() => {
    setBlocks(loadLearningBlocks());
    setStudyPlans(loadStudyPlans());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      saveLearningBlocks(blocks);
    }
  }, [blocks, loaded]);

  useEffect(() => {
    if (loaded) {
      saveStudyPlans(studyPlans);
    }
  }, [loaded, studyPlans]);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const studyPlanMap = useMemo(() => new Map(studyPlans.map((plan) => [plan.id, plan])), [studyPlans]);

  const orderedBlocks = useMemo(
    () =>
      [...blocks].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0) ||
          a.subject.localeCompare(b.subject),
      ),
    [blocks],
  );

  const blocksByDate = useMemo(() => {
    return orderedBlocks.reduce<Record<string, LearningBlock[]>>((acc, block) => {
      acc[block.date] ??= [];
      acc[block.date].push(block);
      return acc;
    }, {});
  }, [orderedBlocks]);

  const removedDatesByDate = useMemo(() => {
    return studyPlans.reduce<Record<string, Array<{ planId: string; label: string }>>>((acc, plan) => {
      for (const removedDate of plan.removedDates ?? []) {
        acc[removedDate] ??= [];
        acc[removedDate].push({
          planId: plan.id,
          label: getStudyPlanName(plan),
        });
      }
      return acc;
    }, {});
  }, [studyPlans]);

  const stats = useMemo(() => {
    const total = blocks.length;
    const learned = blocks.filter((block) => block.learned).length;
    const repeated = blocks.filter((block) => block.repeated).length;
    const tests = blocks.filter((block) => block.testDone).length;
    const progress = total === 0 ? 0 : Math.round((tests / total) * 100);
    return { total, learned, repeated, tests, progress };
  }, [blocks]);

  const generatorPreview = useMemo(
    () => buildStudyPlanPreview(generatorForm, blocks),
    [blocks, generatorForm],
  );

  const planStats = useMemo(
    () =>
      studyPlans
        .map((plan) => getPlanStats(plan, blocks))
        .sort((a, b) => a.examDate.localeCompare(b.examDate) || a.label.localeCompare(b.label)),
    [blocks, studyPlans],
  );

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const groupedGeneratedRows = useMemo(() => {
    return studyPlans.flatMap((plan) =>
      getOriginalLearningBlocks(blocks, plan.id).map((original) => {
        const reviews = getReviewBlocksForOriginal(blocks, original.id);
        const allItems = [original, ...reviews];
        return {
          kind: "generated" as const,
          plan,
          original,
          reviews,
          learnedRepeatedCount: getLearnedRepeatedCount(allItems),
          testCount: getTestDoneCount(allItems),
        };
      }),
    );
  }, [blocks, studyPlans]);

  const manualRows = useMemo(
    () => orderedBlocks.filter((block) => !block.generatedPlanId),
    [orderedBlocks],
  );

  const eligiblePlansForBufferDate = useMemo(() => {
    if (!bufferReviewDate) {
      return [];
    }
    return studyPlans.filter((plan) => canUseAsBufferDay(plan, blocks, bufferReviewDate));
  }, [blocks, bufferReviewDate, studyPlans]);

  const eligibleOriginalBlocksForSelectedPlan = useMemo(() => {
    if (!bufferReviewPlanId) {
      return [];
    }
    return getOriginalLearningBlocks(blocks, bufferReviewPlanId);
  }, [blocks, bufferReviewPlanId]);

  const canShiftGeneratedPlan = Boolean(
    progressTarget?.generatedPlanId &&
      studyPlanMap.has(progressTarget.generatedPlanId) &&
      !progressForm.learned,
  );

  function openManualAdd() {
    setEditingId(null);
    setManualForm(emptyManualForm());
    setView("add");
  }

  function openGeneratePlan() {
    setView("generate");
  }

  function openBufferReviewModal(date: string) {
    const eligiblePlans = studyPlans.filter((plan) => canUseAsBufferDay(plan, blocks, date));
    const firstPlan = eligiblePlans[0];
    const firstOriginal = firstPlan ? getOriginalLearningBlocks(blocks, firstPlan.id)[0] : undefined;
    setBufferReviewDate(date);
    setBufferReviewPlanId(firstPlan?.id ?? "");
    setBufferReviewOriginalId(firstOriginal?.id ?? "");
  }

  function handleSubmitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedSubject = manualForm.subject.trim();
    const trimmedTopic = manualForm.topic.trim();

    if (!manualForm.date || !trimmedSubject || !trimmedTopic) {
      setMessage("Date, subject, and topic are required.");
      return;
    }

    const duplicateDate = blocks.some((block) => block.date === manualForm.date && block.id !== editingId);
    if (duplicateDate) {
      setMessage("Only one manually scheduled learning block can be created for a day.");
      return;
    }

    const payload = {
      date: manualForm.date,
      subject: trimmedSubject,
      topic: trimmedTopic,
      description: manualForm.description,
      examName: manualForm.examName,
      notes: manualForm.notes,
      confidence: parseConfidence(manualForm.confidence),
    };

    if (editingId) {
      setBlocks((current) =>
        current.map((block) => (block.id === editingId ? updateLearningBlock(block, payload) : block)),
      );
      setMessage("Learning block updated.");
    } else {
      setBlocks((current) => [createLearningBlock(payload), ...current]);
      setMessage("Learning block added.");
    }

    setEditingId(null);
    setManualForm(emptyManualForm());
    setView("table");
  }

  function startEdit(block: LearningBlock) {
    setEditingId(block.id);
    setManualForm({
      date: block.date,
      subject: block.subject,
      topic: block.topic,
      description: block.description ?? "",
      examName: block.examName ?? "",
      notes: block.notes ?? "",
      confidence: block.confidence ? String(block.confidence) : "",
    });
    setView("add");
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
    if (progressTarget?.id === id) {
      setProgressTarget(null);
    }
    setMessage("Learning block deleted.");
  }

  function openProgress(block: LearningBlock) {
    const plan = block.generatedPlanId ? studyPlanMap.get(block.generatedPlanId) : undefined;
    setProgressTarget(block);
    setProgressForm({
      learned: block.learned,
      repeated: block.repeated,
      testDone: block.testDone,
      notes: block.notes ?? "",
      confidence: block.confidence ? String(block.confidence) : "",
      shiftRemaining: Boolean(block.generatedPlanId),
      reviewDate: plan ? findNextAvailablePlanDate(plan, blocks, block.date) ?? "" : "",
    });
  }

  function applyRescheduleResult(result: RescheduleResult, successMessage: string) {
    setBlocks(result.blocks);
    if (result.warnings.length > 0) {
      setMessage(result.warnings[0]);
      return;
    }
    if (result.shiftedCount > 0) {
      setMessage(`${successMessage} ${result.shiftedCount} item(s) were shifted.`);
      return;
    }
    setMessage(successMessage);
  }

  function submitBufferReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bufferReviewDate || !bufferReviewPlanId || !bufferReviewOriginalId) {
      setMessage("Choose a valid plan and original learning block for the review day.");
      return;
    }
    const plan = studyPlanMap.get(bufferReviewPlanId);
    const original = blocks.find((block) => block.id === bufferReviewOriginalId);
    if (!plan || !original) {
      setMessage("The selected study plan or learning block could not be found.");
      return;
    }
    const result = addReviewDay({
      plan,
      blocks,
      sourceBlock: original,
      reviewDate: bufferReviewDate,
    });
    if (result.warnings.length > 0) {
      setMessage(result.warnings[0]);
      return;
    }
    setBlocks(result.blocks);
    setMessage(`Added ${original.topic} as a review day on ${formatDate(bufferReviewDate)}.`);
    setBufferReviewDate(null);
    setBufferReviewPlanId("");
    setBufferReviewOriginalId("");
  }

  function saveProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progressTarget) {
      return;
    }

    const updatedBlocks = blocks.map((block) =>
      block.id === progressTarget.id
        ? updateLearningBlock(block, {
            learned: progressForm.learned,
            repeated: progressForm.repeated,
            testDone: progressForm.testDone,
            notes: progressForm.notes,
            confidence: parseConfidence(progressForm.confidence),
          })
        : block,
    );

    const plan = progressTarget.generatedPlanId ? studyPlanMap.get(progressTarget.generatedPlanId) : undefined;
    const updatedCurrentBlock = updatedBlocks.find((block) => block.id === progressTarget.id);

    if (
      progressForm.shiftRemaining &&
      plan &&
      updatedCurrentBlock &&
      !isBlockCompleted(updatedCurrentBlock)
    ) {
      const result = reschedulePlanFromDate({
        blocks: updatedBlocks,
        plan,
        pivotDate: updatedCurrentBlock.date,
      });
      applyRescheduleResult(result, "Progress updated.");
    } else {
      setBlocks(updatedBlocks);
      setMessage("Progress updated.");
    }

    setProgressTarget(null);
  }

  function handleMarkNotDone(block: LearningBlock) {
    const nextBlocks = markBlockNotDone(blocks, block.id);
    const plan = block.generatedPlanId ? studyPlanMap.get(block.generatedPlanId) : undefined;
    if (plan) {
      const result = reschedulePlanFromDate({
        blocks: nextBlocks,
        plan,
        pivotDate: block.date,
      });
      applyRescheduleResult(result, "Marked as not done and rescheduled from here.");
    } else {
      setBlocks(nextBlocks);
      setMessage("Block marked as not done.");
    }
    setProgressTarget(null);
  }

  function handleRescheduleFromHere(block: LearningBlock) {
    if (!block.generatedPlanId) {
      setMessage("Only generated plan items can be rescheduled from here.");
      return;
    }
    const plan = studyPlanMap.get(block.generatedPlanId);
    if (!plan) {
      setMessage("The linked study plan could not be found.");
      return;
    }
    const result = reschedulePlanFromDate({
      blocks,
      plan,
      pivotDate: block.date,
    });
    applyRescheduleResult(result, "Rescheduled remaining blocks.");
    setProgressTarget(null);
  }

  function handleRemoveStudyDay(block: LearningBlock) {
    if (!block.generatedPlanId) {
      setMessage("Only generated plan items can remove a study day.");
      return;
    }
    const plan = studyPlanMap.get(block.generatedPlanId);
    if (!plan) {
      setMessage("The linked study plan could not be found.");
      return;
    }
    if (isBlockCompleted(block)) {
      setMessage("This day already has a completed item. Keep it fixed or reschedule from a later unfinished day.");
      return;
    }
    const { plan: updatedPlan, result } = markPlanDateRemoved(plan, blocks, block.date);
    setStudyPlans((current) => current.map((entry) => (entry.id === plan.id ? updatedPlan : entry)));
    applyRescheduleResult(result, "Study day removed from the plan.");
    setProgressTarget(null);
  }

  function handleRestoreRemovedDate(planId: string, date: string) {
    const plan = studyPlanMap.get(planId);
    if (!plan) {
      return;
    }
    const updatedPlan = clearPlanDateRemoved(plan, date);
    setStudyPlans((current) => current.map((entry) => (entry.id === planId ? updatedPlan : entry)));
    const result = reschedulePlanFromDate({
      blocks,
      plan: updatedPlan,
      pivotDate: date,
      includePivotDate: true,
    });
    applyRescheduleResult(result, `Restored ${formatDate(date)} for ${getStudyPlanName(updatedPlan)}.`);
  }

  function handleAddReviewDay(block: LearningBlock) {
    if (!block.generatedPlanId) {
      setMessage("Review days can only be added to generated plans.");
      return;
    }
    const plan = studyPlanMap.get(block.generatedPlanId);
    if (!plan) {
      setMessage("The linked study plan could not be found.");
      return;
    }
    const requestedDate = progressForm.reviewDate || undefined;
    if (requestedDate && !isDateSchedulable(plan, blocks, requestedDate)) {
      setMessage("That review date is not available for this study plan.");
      return;
    }
    const result = addReviewDay({
      plan,
      blocks,
      sourceBlock: block,
      reviewDate: requestedDate,
    });
    applyRescheduleResult(result, "Review day added.");
    setProgressTarget(null);
  }

  function submitGeneratedPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!generatorPreview.fits) {
      setMessage(generatorPreview.warnings[0] || "Adjust the plan so it fits before the exam date.");
      return;
    }

    const plan = createStudyPlan(generatorForm);
    const generatedBlocks = createGeneratedBlocks(plan, generatorPreview.schedule);
    setStudyPlans((current) => [plan, ...current]);
    setBlocks((current) => [...generatedBlocks, ...current]);
    setMessage(`Generated ${generatedBlocks.length} learning blocks for ${getStudyPlanName(plan)}.`);
    setView("calendar");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f6f8fb] to-[#f8fafc] text-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Exam Learning Tracker
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Plan study blocks and keep the schedule alive
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Generate plans, track progress, and reschedule around missed days, review sessions,
                and unavailable dates.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openManualAdd}
                className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Add block
              </button>
              <button
                type="button"
                onClick={openGeneratePlan}
                className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
              >
                Generate plan
              </button>
            </div>
          </div>
          <div className="mt-5">
            <NavTabs activeView={view} onChange={setView as (view: ViewKey) => void} />
          </div>
          {message && (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </p>
          )}
        </header>

        {view === "dashboard" && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Total learning blocks" value={stats.total} />
              <StatCard label="Learned blocks" value={stats.learned} />
              <StatCard label="Repeated blocks" value={stats.repeated} />
              <StatCard label="Completed tests" value={stats.tests} />
              <StatCard label="Overall progress" value={`${stats.progress}%`} detail="Based on test completion" />
            </div>

            <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Plan health</h2>
                  <p className="text-sm text-slate-500">
                    Buffer days update automatically when blocks move, review days are added, or study dates are removed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView("calendar")}
                  className="text-sm font-semibold text-spruce hover:underline"
                >
                  Open calendar
                </button>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {planStats.map((planStat) => (
                  <article key={planStat.planId} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{planStat.label}</h3>
                        <p className="text-sm text-slate-500">Exam date: {formatDate(planStat.examDate)}</p>
                      </div>
                      {planStat.fits ? (
                        <StatusBadge kind="learned" />
                      ) : (
                        <StatusBadge kind="behind" />
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <MiniStat label="Total items" value={planStat.totalBlocks} />
                      <MiniStat label="Completed" value={planStat.completedBlocks} />
                      <MiniStat label="Remaining" value={planStat.remainingBlocks} />
                      <MiniStat label="Valid days left" value={planStat.validStudyDaysRemaining} />
                      <MiniStat label="Buffer days" value={planStat.bufferDaysRemaining} />
                      <MiniStat label="Behind by" value={planStat.behindBy} />
                    </div>
                    <p className={`mt-4 text-sm font-medium ${planStat.fits ? "text-spruce" : "text-red-700"}`}>
                      {planStat.fits
                        ? `${planStat.label}: ${planStat.bufferDaysRemaining} buffer day(s) remaining`
                        : `${planStat.label}: plan is ${planStat.behindBy} day(s) behind schedule`}
                    </p>
                  </article>
                ))}
                {planStats.length === 0 && (
                  <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                    Generate a study plan to see buffer-day tracking here.
                  </div>
                )}
              </div>
            </section>
          </section>
        )}

        {view === "calendar" && (
          <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Calendar</h2>
                <p className="text-sm text-slate-500">
                  Click an item to mark it done, mark it not done, add a review day, remove the study day, or reschedule from here.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={calendarMonth}
                  onChange={(event) => setCalendarMonth(event.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const dayBlocks = blocksByDate[day.date] ?? [];
                const removedLabels = removedDatesByDate[day.date] ?? [];
                const eligiblePlans = studyPlans.filter((plan) => canUseAsBufferDay(plan, blocks, day.date));
                return (
                  <article
                    key={day.key}
                    className={`min-h-36 rounded-xl border p-3 ${
                      day.inMonth ? "border-line bg-white" : "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{day.dayNumber}</span>
                      {day.date === getTodayDate() && (
                        <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">
                          Today
                        </span>
                      )}
                    </div>
                    {removedLabels.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <StatusBadge kind="removed" />
                        <div className="space-y-1">
                          {removedLabels.map((removed) => (
                            <div
                              key={`${removed.planId}-${day.date}`}
                              className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                            >
                              <p className="text-[11px] text-slate-500">{removed.label}</p>
                              <button
                                type="button"
                                onClick={() => handleRestoreRemovedDate(removed.planId, day.date)}
                                className="mt-1 text-[11px] font-semibold text-spruce hover:underline"
                              >
                                Add this day back
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 space-y-2">
                      {dayBlocks.map((block) => (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() => openProgress(block)}
                          className="block w-full rounded-lg border border-line bg-slate-50 p-2 text-left text-xs text-ink hover:bg-slate-100"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold">{block.subject}</div>
                            <ItemBadge kind={block.itemType === "review" ? "review" : "learning"} />
                          </div>
                          <div className="truncate text-slate-500">{block.topic}</div>
                          <div className="mt-1">
                            <BlockBadges block={block} />
                          </div>
                        </button>
                      ))}
                      {eligiblePlans.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openBufferReviewModal(day.date)}
                          className="w-full rounded-lg border border-dashed border-indigo-200 bg-indigo-50 px-2 py-2 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          Add review block
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "table" && (
          <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">All items</h2>
                <p className="text-sm text-slate-500">
                  Generated blocks stay grouped by their original learning day, while review days increase the learned and test counts.
                </p>
              </div>
              <button
                type="button"
                onClick={openManualAdd}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                New block
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    {[
                      "Source",
                      "Item",
                      "Block #",
                      "Plan / Subject",
                      "Original date",
                      "Review dates",
                      "Learned / repeated count",
                      "Test count",
                      "Status",
                      "Notes",
                      "Actions",
                    ].map((head) => (
                      <th key={head} className="border-b border-line px-3 py-3 font-semibold">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedGeneratedRows.map((row) => {
                    const statusBadges = [];
                    if (row.original.learned) {
                      statusBadges.push(<StatusBadge key="learned" kind="learned" />);
                    }
                    if (row.original.repeated) {
                      statusBadges.push(<StatusBadge key="repeated" kind="repeated" />);
                    }
                    if (row.original.testDone) {
                      statusBadges.push(<StatusBadge key="test" kind="test-done" />);
                    }

                    return (
                      <tr key={row.original.id} className="align-top">
                        <td className="border-b border-line px-3 py-3">
                          <SourceBadge kind="generated" />
                        </td>
                        <td className="border-b border-line px-3 py-3">
                          <ItemBadge kind="learning" />
                        </td>
                        <td className="border-b border-line px-3 py-3 whitespace-nowrap font-semibold">
                          {row.original.blockNumber ? `#${row.original.blockNumber}` : "-"}
                        </td>
                        <td className="border-b border-line px-3 py-3">
                          <div className="font-medium">{getStudyPlanName(row.plan)}</div>
                          <div className="text-xs text-slate-500">{row.original.topic}</div>
                        </td>
                        <td className="border-b border-line px-3 py-3 whitespace-nowrap">{formatDate(row.original.date)}</td>
                        <td className="border-b border-line px-3 py-3 text-slate-600">
                          {row.reviews.length > 0
                            ? row.reviews.map((review) => formatDate(review.date)).join(", ")
                            : "-"}
                        </td>
                        <td className="border-b border-line px-3 py-3 font-semibold">{row.learnedRepeatedCount}</td>
                        <td className="border-b border-line px-3 py-3 font-semibold">{row.testCount}</td>
                        <td className="border-b border-line px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {statusBadges.length > 0 ? statusBadges : <StatusBadge kind="not-started" />}
                            {row.reviews.length > 0 && <ItemBadge kind="review" />}
                          </div>
                        </td>
                        <td className="border-b border-line px-3 py-3 text-slate-600">
                          {row.original.notes || row.original.description || "-"}
                        </td>
                        <td className="border-b border-line px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openProgress(row.original)}
                              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkNotDone(row.original)}
                              className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Not done
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {manualRows.map((block) => {
                    const plan = block.generatedPlanId ? studyPlanMap.get(block.generatedPlanId) : undefined;
                    const label = plan ? getStudyPlanName(plan) : block.subject;
                    const details = block.itemType === "review" ? `Review of ${block.topic}` : block.topic;

                    return (
                      <tr key={block.id} className="align-top">
                        <td className="border-b border-line px-3 py-3">
                          <SourceBadge kind={block.isGenerated ? "generated" : "manual"} />
                        </td>
                        <td className="border-b border-line px-3 py-3">
                          <ItemBadge kind={block.itemType === "review" ? "review" : "learning"} />
                        </td>
                        <td className="border-b border-line px-3 py-3 whitespace-nowrap font-semibold">
                          {block.blockNumber ? `#${block.blockNumber}` : "-"}
                        </td>
                        <td className="border-b border-line px-3 py-3">
                          <div className="font-medium">{label}</div>
                          <div className="text-xs text-slate-500">{details}</div>
                          {block.isGenerated && <div className="text-xs text-slate-500">Auto-generated or moved by plan</div>}
                        </td>
                        <td className="border-b border-line px-3 py-3 whitespace-nowrap">{formatDate(block.date)}</td>
                        <td className="border-b border-line px-3 py-3 text-slate-600">-</td>
                        <td className="border-b border-line px-3 py-3 font-semibold">
                          {block.learned || block.repeated ? 1 : 0}
                        </td>
                        <td className="border-b border-line px-3 py-3 font-semibold">{block.testDone ? 1 : 0}</td>
                        <td className="border-b border-line px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {block.learned && <StatusBadge kind="learned" />}
                            {block.repeated && <StatusBadge kind="repeated" />}
                            {block.testDone && <StatusBadge kind="test-done" />}
                            {!block.learned && !block.repeated && !block.testDone && <StatusBadge kind="not-started" />}
                          </div>
                        </td>
                        <td className="border-b border-line px-3 py-3 text-slate-600">{block.notes || block.description || "-"}</td>
                        <td className="border-b border-line px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openProgress(block)}
                              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkNotDone(block)}
                              className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Not done
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBlock(block.id)}
                              className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {groupedGeneratedRows.length === 0 && manualRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                        No learning items yet. Use Add Block or Generate Plan to start planning.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "add" && (
          <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{editingId ? "Edit learning block" : "Add learning block"}</h2>
                <p className="text-sm text-slate-500">Manual entries still work alongside generated plans.</p>
              </div>
              <button
                type="button"
                onClick={() => setView("table")}
                className="text-sm font-semibold text-spruce hover:underline"
              >
                Back to table
              </button>
            </div>

            <form onSubmit={handleSubmitManual} className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Date" required>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="Subject" required>
                <input
                  value={manualForm.subject}
                  onChange={(event) => setManualForm((current) => ({ ...current, subject: event.target.value }))}
                  className="input"
                  placeholder="Math"
                />
              </Field>
              <Field label="Topic / title" required className="md:col-span-2">
                <input
                  value={manualForm.topic}
                  onChange={(event) => setManualForm((current) => ({ ...current, topic: event.target.value }))}
                  className="input"
                  placeholder="Limits and derivatives"
                />
              </Field>
              <Field label="Description / notes" className="md:col-span-2">
                <textarea
                  rows={4}
                  value={manualForm.description}
                  onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="Optional exam name">
                <input
                  value={manualForm.examName}
                  onChange={(event) => setManualForm((current) => ({ ...current, examName: event.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="Confidence level (1 to 5)">
                <select
                  value={manualForm.confidence}
                  onChange={(event) => setManualForm((current) => ({ ...current, confidence: event.target.value }))}
                  className="input"
                >
                  <option value="">Not set</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </Field>
              <Field label="Notes for today" className="md:col-span-2">
                <textarea
                  rows={3}
                  value={manualForm.notes}
                  onChange={(event) => setManualForm((current) => ({ ...current, notes: event.target.value }))}
                  className="input"
                />
              </Field>
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">
                  {editingId ? "Save changes" : "Add block"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setManualForm(emptyManualForm());
                  }}
                  className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
                >
                  Reset
                </button>
              </div>
            </form>
          </section>
        )}

        {view === "generate" && (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
              <div>
                <h2 className="text-xl font-semibold">Generate Learning Plan</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Preview the schedule before saving it. Removed dates and later review days will keep updating the plan after creation.
                </p>
              </div>

              <form onSubmit={submitGeneratedPlan} className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Subject or exam name" required>
                  <input
                    value={generatorForm.subject}
                    onChange={(event) => setGeneratorForm((current) => ({ ...current, subject: event.target.value }))}
                    className="input"
                    placeholder="Mathematics"
                  />
                </Field>
                <Field label="Optional exam name">
                  <input
                    value={generatorForm.examName}
                    onChange={(event) => setGeneratorForm((current) => ({ ...current, examName: event.target.value }))}
                    className="input"
                    placeholder="Final exam"
                  />
                </Field>
                <Field label="Start date" required>
                  <input
                    type="date"
                    value={generatorForm.startDate}
                    onChange={(event) => setGeneratorForm((current) => ({ ...current, startDate: event.target.value }))}
                    className="input"
                  />
                </Field>
                <Field label="Exam date" required>
                  <input
                    type="date"
                    value={generatorForm.examDate}
                    onChange={(event) => setGeneratorForm((current) => ({ ...current, examDate: event.target.value }))}
                    className="input"
                  />
                </Field>
                <Field label="Total learning blocks" required>
                  <input
                    type="number"
                    min={1}
                    value={generatorForm.totalBlocks}
                    onChange={(event) => setGeneratorForm((current) => ({ ...current, totalBlocks: event.target.value }))}
                    className="input"
                  />
                </Field>
                <Field label="Optional prefix for block names">
                  <input
                    value={generatorForm.blockPrefix}
                    onChange={(event) => setGeneratorForm((current) => ({ ...current, blockPrefix: event.target.value }))}
                    className="input"
                    placeholder="Block"
                  />
                </Field>

                <div className="md:col-span-2 rounded-xl border border-line p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Study weekdays</p>
                        <p className="text-xs text-slate-500">Each valid day receives at most one generated plan item.</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={generatorForm.includeWeekends}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setGeneratorForm((current) => ({
                              ...current,
                              includeWeekends: checked,
                              selectedWeekdays: checked
                                ? current.selectedWeekdays
                                : current.selectedWeekdays.filter((day) => day !== 0 && day !== 6),
                            }));
                          }}
                        />
                        Include weekends
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                      {weekdayOptions.map((option) => {
                        const disabled = !generatorForm.includeWeekends && (option.day === 0 || option.day === 6);
                        const checked = generatorForm.selectedWeekdays.includes(option.day);
                        return (
                          <label
                            key={option.day}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                              disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "border-line"
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={checked}
                              onChange={() => toggleWeekday(option.day, setGeneratorForm)}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={!generatorPreview.fits}
                  >
                    Generate blocks
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeneratorForm(defaultGeneratorForm())}
                    className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
                <h3 className="text-lg font-semibold">Plan summary</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SummaryCard label="Required study days" value={generatorPreview.requiredStudyDays} />
                  <SummaryCard label="Calendar days available" value={generatorPreview.calendarDaysAvailable} />
                  <SummaryCard label="Valid study days available" value={generatorPreview.validStudyDaysAvailable} />
                  <SummaryCard label="Buffer days" value={generatorPreview.bufferDays} />
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {generatorPreview.fits ? (
                    <p>
                      You need {generatorPreview.requiredStudyDays} study days. You have {generatorPreview.validStudyDaysAvailable} valid study days before the exam. Buffer days: {generatorPreview.bufferDays}.
                    </p>
                  ) : (
                    <p className="font-medium text-rose-700">
                      This plan does not fit before the exam date. Add more study weekdays, include weekends, reduce the number of blocks, or move the start date earlier.
                    </p>
                  )}
                  {generatorPreview.warnings.map((warning) => (
                    <p key={warning} className="mt-2 text-rose-700">
                      {warning}
                    </p>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Preview</h3>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {generatorPreview.schedule.length} blocks
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {generatorPreview.schedule.slice(0, 12).map((item) => (
                    <article key={`${item.date}-${item.blockNumber}`} className="rounded-xl border border-line p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-500">{formatDate(item.date)}</p>
                          <p className="font-semibold">{item.topic}</p>
                        </div>
                        <SourceBadge kind="generated" />
                      </div>
                    </article>
                  ))}
                  {generatorPreview.schedule.length === 0 && (
                    <p className="text-sm text-slate-500">Fill in the form to preview your schedule.</p>
                  )}
                </div>
              </section>
            </aside>
          </section>
        )}

        {studyPlans.some((plan) => (plan.removedDates ?? []).length > 0) && (
          <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Removed study days</h2>
                <p className="text-sm text-slate-500">These dates are excluded from future plan rescheduling.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {studyPlans.flatMap((plan) =>
                (plan.removedDates ?? []).map((date) => (
                  <button
                    key={`${plan.id}-${date}`}
                    type="button"
                    onClick={() => handleRestoreRemovedDate(plan.id, date)}
                    className="rounded-full border border-line bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {getStudyPlanName(plan)}: {formatDate(date)}
                  </button>
                )),
              )}
            </div>
          </section>
        )}
      </div>

      {progressTarget && (
        <Modal title={`Update item: ${progressTarget.subject}`} onClose={() => setProgressTarget(null)}>
          <form onSubmit={saveProgress} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <SourceBadge kind={progressTarget.isGenerated ? "generated" : "manual"} />
              <ItemBadge kind={progressTarget.itemType === "review" ? "review" : "learning"} />
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-line p-3">
              <input
                type="checkbox"
                checked={progressForm.learned}
                onChange={(event) => setProgressForm((current) => ({ ...current, learned: event.target.checked }))}
              />
              <span>Mark as learned</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-line p-3">
              <input
                type="checkbox"
                checked={progressForm.repeated}
                onChange={(event) => setProgressForm((current) => ({ ...current, repeated: event.target.checked }))}
              />
              <span>Mark as repeated</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-line p-3">
              <input
                type="checkbox"
                checked={progressForm.testDone}
                onChange={(event) => setProgressForm((current) => ({ ...current, testDone: event.target.checked }))}
              />
              <span>Mark as test done</span>
            </label>

            {canShiftGeneratedPlan && (
              <label className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <input
                  type="checkbox"
                  checked={progressForm.shiftRemaining}
                  onChange={(event) => setProgressForm((current) => ({ ...current, shiftRemaining: event.target.checked }))}
                />
                <span className="text-sm text-slate-700">
                  Reschedule this item and the later unfinished items onto the next valid study days.
                </span>
              </label>
            )}

            {progressTarget.generatedPlanId && (
              <Field label="Review day date">
                <input
                  type="date"
                  value={progressForm.reviewDate}
                  onChange={(event) => setProgressForm((current) => ({ ...current, reviewDate: event.target.value }))}
                  className="input"
                />
              </Field>
            )}

            <Field label="Confidence level">
              <select
                value={progressForm.confidence}
                onChange={(event) => setProgressForm((current) => ({ ...current, confidence: event.target.value }))}
                className="input"
              >
                <option value="">Not set</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                rows={4}
                value={progressForm.notes}
                onChange={(event) => setProgressForm((current) => ({ ...current, notes: event.target.value }))}
                className="input"
              />
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleMarkNotDone(progressTarget)}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700"
              >
                Mark as not done
              </button>
              <button
                type="button"
                onClick={() => handleRescheduleFromHere(progressTarget)}
                className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Reschedule from here
              </button>
              {progressTarget.generatedPlanId && (
                <button
                  type="button"
                  onClick={() => handleAddReviewDay(progressTarget)}
                  className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700"
                >
                  Add review day
                </button>
              )}
              {progressTarget.generatedPlanId && (
                <button
                  type="button"
                  onClick={() => handleRemoveStudyDay(progressTarget)}
                  className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Remove this day from the plan
                </button>
              )}
              {progressTarget.itemType === "review" && (
                <button
                  type="button"
                  onClick={() => {
                    removeBlock(progressTarget.id);
                    setProgressTarget(null);
                  }}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700"
                >
                  Delete review day
                </button>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProgressTarget(null)}
                className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">
                Save progress
              </button>
            </div>
          </form>
        </Modal>
      )}

      {bufferReviewDate && (
        <Modal
          title={`Add review block on ${formatDate(bufferReviewDate)}`}
          onClose={() => {
            setBufferReviewDate(null);
            setBufferReviewPlanId("");
            setBufferReviewOriginalId("");
          }}
        >
          <form onSubmit={submitBufferReview} className="space-y-4">
            <Field label="Study plan" required>
              <select
                value={bufferReviewPlanId}
                onChange={(event) => {
                  const nextPlanId = event.target.value;
                  const firstOriginal = getOriginalLearningBlocks(blocks, nextPlanId)[0];
                  setBufferReviewPlanId(nextPlanId);
                  setBufferReviewOriginalId(firstOriginal?.id ?? "");
                }}
                className="input"
              >
                <option value="">Select a plan</option>
                {eligiblePlansForBufferDate.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {getStudyPlanName(plan)} - exam {formatDate(plan.examDate)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Generated learning block" required>
              <select
                value={bufferReviewOriginalId}
                onChange={(event) => setBufferReviewOriginalId(event.target.value)}
                className="input"
              >
                <option value="">Select a generated block</option>
                {eligibleOriginalBlocksForSelectedPlan.map((block) => (
                  <option key={block.id} value={block.id}>
                    {`${block.topic} - originally planned for ${formatDate(block.date)} - ${block.learned || block.repeated ? "reviewed" : "not reviewed yet"}`}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setBufferReviewDate(null);
                  setBufferReviewPlanId("");
                  setBufferReviewOriginalId("");
                }}
                className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">
                Add review block
              </button>
            </div>
          </form>
        </Modal>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #d9e2ee;
          background: white;
          padding: 0.75rem 0.875rem;
          color: #172033;
          outline: none;
        }

        .input:focus {
          border-color: #0f766e;
          box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
        }
      `}</style>
    </main>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-2 ${className ?? ""}`}>
      <span className="text-sm font-semibold text-slate-700">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-ink">
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function parseConfidence(value: string) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return undefined;
  }
  return parsed;
}

function toggleWeekday(day: number, setGeneratorForm: Dispatch<SetStateAction<StudyPlanFormValue>>) {
  setGeneratorForm((current) => ({
    ...current,
    selectedWeekdays: current.selectedWeekdays.includes(day)
      ? current.selectedWeekdays.filter((entry) => entry !== day)
      : [...current.selectedWeekdays, day],
  }));
}

function buildCalendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = formatLocalDate(date);
    return {
      key: iso,
      date: iso,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === monthNumber - 1,
    };
  });
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

function isBlockCompleted(block: LearningBlock) {
  return block.learned || block.repeated || block.testDone;
}
