"use client";

import { labelHealth, labelProjectStatus, formatDate, daysUntil, percent } from "../project-center-formatters";
import type { ProjectListItem } from "../project-center-types";
import styles from "../ProjectCenter.module.css";

function healthClass(value: string) {
  return value === "RED" ? styles.red : value === "YELLOW" ? styles.yellow : styles.green;
}

export function ProjectList({ items, onOpen }: { items: ProjectListItem[]; onOpen: (id: number) => void }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>项目</th><th>场地 / 当前阶段</th><th>健康度</th><th>活动时间</th><th>距离活动</th><th>项目经理</th><th>任务进度</th><th>逾期 / 阻塞</th><th>更新</th><th /></tr></thead>
        <tbody>
          {items.map((item) => {
            const progress = percent(item.doneTaskCount, item.publishedTaskCount);
            return <tr key={item.id}>
              <td className={styles.projectName}><button className={styles.linkButton} type="button" onClick={() => onOpen(item.id)}>{item.name}</button><span>{item.code} · {labelProjectStatus(item.executionStatus)}</span></td>
              <td><strong>{item.venueName || "未填写场地"}</strong><span>{item.currentPhase || "尚未开始阶段"}</span></td>
              <td><span className={`${styles.health} ${healthClass(item.healthStatus)}`}>{labelHealth(item.healthStatus)}</span>{item.healthReasons.map((reason) => <span key={reason}>{reason}</span>)}</td>
              <td><strong>{formatDate(item.activityStartAt)}</strong><span>至 {formatDate(item.activityEndAt)}</span></td>
              <td>{daysUntil(item.activityStartAt)}</td>
              <td>{item.projectManager.name || "未指定"}</td>
              <td className={styles.progress}><strong>{item.doneTaskCount} / {item.publishedTaskCount}</strong><span>{progress}% 已完成</span><div className={styles.progressTrack}><i style={{ width: `${progress}%` }} /></div></td>
              <td><strong>{item.overdueTaskCount} 个逾期</strong><span>{item.blockedTaskCount} 个阻塞</span></td>
              <td>{formatDate(item.updatedAt, true)}</td>
              <td><button className="button secondary" type="button" onClick={() => onOpen(item.id)}>查看</button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
