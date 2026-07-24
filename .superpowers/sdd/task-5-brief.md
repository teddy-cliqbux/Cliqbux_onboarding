## Task 5: Underwriting table polish

**Files:**
- Modify: `src/components/onboarding/UnderwritingTracker.jsx`

- [ ] **Step 1: Remove `max-w-3xl mx-auto` wrapper** so it fills the wide main canvas

- [ ] **Step 2: Add a MID rows table below the stage strip** (same data already in `items`):

```jsx
<table className="w-full text-left">
  <thead>
    <tr className="border-b border-cb-border text-cb-caption uppercase text-gray-500">
      <th className="px-4 py-2 font-medium">Account</th>
      <th className="px-4 py-2 font-medium">Status</th>
      <th className="px-4 py-2 font-medium">MID</th>
    </tr>
  </thead>
  <tbody>
    {items.length === 0 ? (
      <tr>
        <td colSpan={3} className="px-4 py-10 text-center text-cb-body text-gray-500">
          No processing accounts yet
        </td>
      </tr>
    ) : items.map((row) => (
      <tr key={row.id || row.elavonMID} className="border-b border-cb-border/60">
        <td className="px-4 py-3 text-cb-body text-white">
          {row.merchantName || row.dbaName || 'Processing account'}
        </td>
        <td className="px-4 py-3 text-cb-caption normal-case tracking-normal text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
            {row.applicationStepStatus || 'In Review'}
          </span>
        </td>
        <td className="px-4 py-3 text-cb-caption font-mono text-gray-300">
          {row.elavonMID || 'â€”'}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

Keep existing stage progress header; do not change props.

- [ ] **Step 3: Stage**

```bash
git add src/components/onboarding/UnderwritingTracker.jsx
```

---

#
