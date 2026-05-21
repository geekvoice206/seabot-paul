export interface Incident {
  id?: string;
  occurrence: Date;
  note?: string;
  link?: string;
}

export interface Warning {
  id?: string;
  userId: string;
  username: string;
  issuedBy: string;
  issuedByUsername: string;
  reason: string;
  timestamp: string;
}
