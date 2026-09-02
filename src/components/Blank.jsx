import React from 'react';
export default function Blank({title='Nothing here yet',text=''}){return <div className="emptyState"><h3>{title}</h3>{text&&<p>{text}</p>}</div>}
