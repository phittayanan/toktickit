import express from 'express'

// api-spec.md §1.5 step 5: a route that takes a JSON body reads it after
// its session and role checks, so a body the server cannot read never
// changes the answer of an earlier check.
export const parseJsonBody = express.json()
