export const GET_JOB_STATUS_QUERY = `
  query GetJobStatus($id: ID!) {
    job(id: $id) { id done }
  }
`;
