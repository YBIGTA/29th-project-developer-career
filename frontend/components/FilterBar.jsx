"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_ROLES } from "@/lib/roles";

export default function FilterBar({
  roles,
  selectedRole,
  onRoleChange,
  hasRoleData,
  resultCount,
  totalCount,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // 바깥을 클릭하거나 Esc를 누르면 메뉴를 닫는다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const options = [{ value: ALL_ROLES, label: "전체" }, ...roles.map((role) => ({ value: role, label: role }))];
  const currentLabel = options.find((o) => o.value === selectedRole)?.label ?? "전체";

  return (
    <div className="filter-bar">
      <div className="filter-bar__fields">
        <div className="filter-bar__field" ref={rootRef}>
          <label id="role-filter-label">직군</label>
          <div className="filter-select">
            <button
              type="button"
              className="filter-select__trigger"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-labelledby="role-filter-label"
              disabled={!hasRoleData}
              onClick={() => setOpen((v) => !v)}
            >
              {currentLabel}
              <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
                <path
                  d="M4 6.4 8 10.4 12 6.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {open && (
              <ul className="filter-select__menu" role="listbox" aria-labelledby="role-filter-label">
                {options.map((o) => (
                  <li key={o.value} role="option" aria-selected={o.value === selectedRole}>
                    <button
                      type="button"
                      className={`filter-select__option${o.value === selectedRole ? " filter-select__option--selected" : ""}`}
                      onClick={() => {
                        onRoleChange(o.value);
                        setOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* 직군은 채용공고에서 뽑은 원본 14종이다. 응답에 roleBreakdown이
              없으면 hasRoleData가 false가 되어 드롭다운은 남되 자동으로
              비활성화된다 — UI를 지울 필요가 없다. */}
          {!hasRoleData && <span className="filter-bar__hint">직군 데이터 없음</span>}
        </div>
      </div>
      <span className="filter-bar__count">
        {resultCount} / {totalCount}개 기술
      </span>
    </div>
  );
}
