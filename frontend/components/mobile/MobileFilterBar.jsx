"use client";

import { useEffect, useRef, useState } from "react";

export default function MobileFilterBar({
  roles,
  selectedRole,
  onRoleChange,
  hasRoleData,
  resultCount,
  totalCount,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  const options = [{ value: "all", label: "전체" }, ...roles.map((role) => ({ value: role, label: role }))];
  const currentLabel = options.find((o) => o.value === selectedRole)?.label ?? "전체";

  return (
    <div className="mv-filter">
      {/* 트리거와 메뉴를 모두 rootRef 안에 둬야 한다. 메뉴가 밖에 있으면
          옵션을 탭할 때 "바깥 클릭"으로 오인돼 mousedown 시점에 메뉴가
          먼저 닫혀버려 선택이 씹힌다. */}
      <div className="mv-filter__field" ref={rootRef}>
        <div className="mv-filter__row">
          <label id="mv-role-filter-label">직군</label>
          <span className="mv-filter__count">
            {resultCount} / {totalCount}개
          </span>
        </div>

        <div className="mv-select">
          <button
            type="button"
            className="mv-select__trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby="mv-role-filter-label"
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
            <ul className="mv-select__menu" role="listbox" aria-labelledby="mv-role-filter-label">
              {options.map((o) => (
                <li key={o.value} role="option" aria-selected={o.value === selectedRole}>
                  <button
                    type="button"
                    className={`mv-select__option${o.value === selectedRole ? " mv-select__option--selected" : ""}`}
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

        {!hasRoleData && <span className="mv-filter__hint">직군 데이터 없음</span>}
      </div>
    </div>
  );
}
