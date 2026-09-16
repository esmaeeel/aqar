"use client";

import {useLayoutEffect,useRef,type ReactNode} from "react";

/** Keep the first column outside the horizontal scroller (WebKit RTL paint bug).
 * Both panes use the same React data/actions; the full table determines row sizes.
 */
export function ResultTableViewport({children,pinned,label,archived=false}:{children:ReactNode;pinned:ReactNode;label:string;archived?:boolean}){
  const scrolling=useRef<HTMLDivElement>(null),fixed=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const source=scrolling.current,target=fixed.current;
    if(!source||!target)return;
    const table=source.querySelector("table");
    if(!table)return;
    const align=()=>{
      const first=table.querySelector("th");
      if(!first)return;
      target.style.width=`${first.getBoundingClientRect().width}px`;
      target.style.height=`${source.clientHeight}px`;
      const rows=target.querySelectorAll<HTMLTableRowElement>("tr");
      table.querySelectorAll("tr").forEach((row,index)=>{if(rows[index])rows[index].style.height=`${row.getBoundingClientRect().height}px`});
      target.style.paddingBottom=getComputedStyle(source).paddingBottom;
      target.scrollTop=source.scrollTop;
      target.style.visibility="visible";
    };
    align();
    const resize=new ResizeObserver(align);
    resize.observe(table);
    resize.observe(source);
    return()=>resize.disconnect();
  },[children,pinned]);

  useLayoutEffect(()=>{
    const source=scrolling.current,target=fixed.current;
    if(!source||!target)return;
    let gesture:{x:number;y:number;scroll:number;axis:"x"|"y"|null}|null=null;
    const start=(event:TouchEvent)=>{
      if(event.touches.length!==1||(event.target as Element).closest(".columnDragHandle,.columnResizeHandle"))return;
      const touch=event.touches[0];gesture={x:touch.clientX,y:touch.clientY,scroll:source.scrollLeft,axis:null};
    };
    const move=(event:TouchEvent)=>{
      if(!gesture||event.touches.length!==1)return;
      const dx=event.touches[0].clientX-gesture.x,dy=event.touches[0].clientY-gesture.y;
      if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=6)gesture.axis=Math.abs(dx)>Math.abs(dy)?"x":"y";
      if(gesture.axis==="x"){event.preventDefault();source.scrollLeft=gesture.scroll-dx}
    };
    const finish=()=>{gesture=null};
    const wheel=(event:WheelEvent)=>{if(event.deltaX){event.preventDefault();source.scrollLeft+=event.deltaX;source.scrollTop+=event.deltaY}};
    target.addEventListener("touchstart",start,{passive:true});
    target.addEventListener("touchmove",move,{passive:false});
    target.addEventListener("touchend",finish);target.addEventListener("touchcancel",finish);
    target.addEventListener("wheel",wheel,{passive:false});
    return()=>{target.removeEventListener("touchstart",start);target.removeEventListener("touchmove",move);target.removeEventListener("touchend",finish);target.removeEventListener("touchcancel",finish);target.removeEventListener("wheel",wheel)};
  },[!!pinned]);
  function syncTop(source:HTMLDivElement,target:HTMLDivElement|null){if(target&&Math.abs(target.scrollTop-source.scrollTop)>.5)target.scrollTop=source.scrollTop}
  return <div className={`resultsTableFrame ${pinned?"withPinnedColumn":""} ${archived?"archivedTableFrame":""}`}>
    <div ref={scrolling} className={`resultsTableWrap ${archived?"archivedTableWrap":""}`} role="region" aria-label={label} tabIndex={0} onScroll={event=>syncTop(event.currentTarget,fixed.current)}>{children}</div>
    {pinned&&<div ref={fixed} className="resultsPinnedPane" aria-label="العمود الأول المثبت" onScroll={event=>syncTop(event.currentTarget,scrolling.current)}>{pinned}</div>}
  </div>;
}
