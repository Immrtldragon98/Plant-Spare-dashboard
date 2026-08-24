import React from 'react';
export default function Blank({ value }) {
  return <>{value === null || value === undefined || value === '' ? '—' : value}</>;
}
