import { TimeRange } from '../../../../src/plugins/data/common';

export interface QueryAssistResponse {
  query: string;
  timeRange?: TimeRange;
}

export interface QueryAssistParameters {
  question: string;
  index: string;
  language: string;
  // for MDS
  dataSourceId?: string;
}
