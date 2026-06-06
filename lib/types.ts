export interface Fund {
  id: string;
  name: string;
  description: string;
  order: number;
  createdAt: number;
  /** studentId of the LP who created (pitched) this fund. */
  ownerStudentId: string;
  /** Display name of the LP who created this fund. */
  ownerName: string;
  /** Public Vercel Blob URL of the uploaded pitch PDF. */
  pdfUrl: string;
  /** Original filename of the uploaded PDF (used for the download label). */
  pdfName?: string;
  /** Legacy: logos are no longer used in the student-pitch flow. */
  hasLogo?: boolean;
}

export interface FundAllocation {
  fundId: string;
  amount: number;
}

export interface StudentAllocation {
  studentId: string;
  studentName: string;
  allocations: FundAllocation[];
  totalAllocated: number;
  submittedAt: number;
}
