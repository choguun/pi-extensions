/**
 * PR comment classifier.
 *
 * Routes a single comment to the AIDLC phase + priority that should
 * handle it. Used by `/aidlc classify-comments` and the review feedback
 * loop. Lives in its own file so the test suite can import the same
 * function the runtime uses (no drift).
 */

export type Priority = "P0" | "P1" | "P2";

export interface Classification {
	phase: string;
	priority: Priority;
	reason: string;
}

/**
 * Classify a single PR comment into a routing action.
 *
 * Routing rules (in order — first match wins):
 *
 *   1. Review-bot digests (`**N issue found**` headers from cubic-dev-ai
 *      etc.) — keyword-match inside the digest to choose P0/P1/P2.
 *   2. Build/test failure — "the build is broken", "test failing", etc.
 *   3. Missing test/coverage request — "where are the tests?".
 *   4. Real bug (race, leak, crash, etc.).
 *   5. Security issue (CVE, injection, XSS).
 *   6. Spec/requirements issue (out of scope, scope creep).
 *   7. Architecture/design suggestion (refactor, abstraction).
 *   8. Style nit (typo, doc, naming).
 *   9. Fallback — needs human review.
 */
export function classifyComment(body: string, _author: string): Classification {
	const lower = body.toLowerCase();

	// 1. Review-bot digests.
	if (/\b(\d+)\s+issues?\s+found\b/i.test(body) || /\*\*no issues found\*\*/i.test(body)) {
		if (/security|cve|injection|xss|csrf|vuln|rce/i.test(body)) {
			return { phase: "implement", priority: "P0", reason: "Review-bot found security issues" };
		}
		if (/bug|broken|race|leak|crash|panic|null pointer/i.test(body)) {
			return { phase: "implement", priority: "P0", reason: "Review-bot found bug issues" };
		}
		if (/test|spec|failing|build/i.test(body)) {
			return { phase: "test", priority: "P1", reason: "Review-bot found test/build issues" };
		}
		return { phase: "review", priority: "P2", reason: "Review-bot digest — read for details" };
	}

	// 2. Build/test failure. Run BEFORE the generic bug check so that
	// "the build is broken" routes to /test instead of /implement. The
	// second regex needs (fail|failing|failed|failure|...) because \b
	// doesn't match between "fail" and "i" — "fail" is a substring of
	// "failing".
	if (
		/\b(test|tests|spec|build|failing|failed|failure|broken test)\b/.test(lower) &&
		/\b(fail|failing|failed|failure|broken|error|red)\b/.test(lower)
	) {
		return { phase: "test", priority: "P1", reason: "Test/build failure mentioned" };
	}

	// 3. Missing test/coverage request. (test|tests|...) not just (test)
	// — \b won't match between "test" and "s".
	if (/\b(add|need|missing|where).*(test|tests|coverage|spec)\b/.test(lower)) {
		return { phase: "test", priority: "P1", reason: "Test/coverage missing" };
	}

	// 4. Real bug. Excludes "broken" (handled by the build/test rule
	// above — "the build is broken" is a build failure, not a bug).
	if (/\b(bug|race|leak|crash|overflow|panic|null pointer|segfault|undefined behavior)\b/.test(lower)) {
		return { phase: "implement", priority: "P0", reason: "Real bug reported" };
	}

	// 5. Security.
	if (/\b(security|cve|injection|xss|csrf|vuln|rce|unauthorized|exposed)\b/.test(lower)) {
		return { phase: "implement", priority: "P0", reason: "Security issue" };
	}

	// 6. Spec/requirements.
	if (/\b(spec|requirement|missing requirement|out of scope|scope creep|acceptance criterion)\b/.test(lower)) {
		return { phase: "specify", priority: "P1", reason: "Spec/requirements issue" };
	}

	// 7. Design/refactor.
	if (/\b(design|architect|refactor|abstraction|coupling|simplif|complexity|cleanup)\b/.test(lower)) {
		return { phase: "implement", priority: "P2", reason: "Design/refactor suggestion" };
	}

	// 8. Style nit.
	if (/\b(nit|naming|comment|typo|doc|style|format|whitespace)\b/.test(lower)) {
		return { phase: "implement", priority: "P2", reason: "Style nit" };
	}

	// 9. Fallback.
	return { phase: "review", priority: "P2", reason: "Needs human classification" };
}