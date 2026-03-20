export type ProblemData = {
  url: string;
  title: string;
  statementText: string;
  statementHtml: string;
  currentCode: string;
  currentCodeLineCount: number;
  samples: Array<{
    input: string;
    output: string;
  }>;
  limits: {
    time?: string;
    memory?: string;
    language?: string;
  };
};

export type SolveResult = {
  model: string;
  promptPreview: string;
  generatedTitle?: string;
  summary?: string;
  problemType?: string;
  problemDefinition?: string;
  approach?: string;
  code: string;
};
