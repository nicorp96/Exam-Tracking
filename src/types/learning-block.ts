export type LearningBlock = {
  id: string;
  date: string;
  subject: string;
  topic: string;
  description?: string;
  examName?: string;
  learned: boolean;
  repeated: boolean;
  testDone: boolean;
  confidence?: number;
  notes?: string;
  generatedPlanId?: string;
  blockNumber?: number;
  isGenerated?: boolean;
  itemType?: "learning" | "review";
  originalBlockId?: string;
  createdAt: string;
  updatedAt: string;
};

export type StudyPlan = {
  id: string;
  subject: string;
  examName?: string;
  startDate: string;
  examDate: string;
  totalBlocks: number;
  selectedWeekdays: number[];
  includeWeekends: boolean;
  blockPrefix: string;
  removedDates?: string[];
  createdAt: string;
  updatedAt: string;
};

export type LearningBlockInput = Pick<
  LearningBlock,
  "date" | "subject" | "topic" | "description" | "examName" | "notes" | "confidence"
>;
