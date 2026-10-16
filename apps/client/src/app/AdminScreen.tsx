import { useEffect, useState } from "react"
import type { ProjectSummary } from "@cartography/project-schema"
import { Button } from "../components/ui/button.js"
import { t } from "../i18n/translate.js"
import type { Session } from "./connection.js"

type AdminProps = {
  session: Session
  onOpen: (projectId: string, token: string) => void
  onDisconnect: () => void
}

export function AdminScreen({ session, onOpen, onDisconnect }: AdminProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState("")
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const headers = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }

  async function reload() {
    const response = await fetch(`${session.server}/api/v1/projects`, { headers })
    if (!response.ok) return
    const body = (await response.json()) as { projects: ProjectSummary[] }
    setProjects(body.projects)
  }

  useEffect(() => {
    void reload()
  }, [session.server, session.token])

  async function create() {
    const response = await fetch(`${session.server}/api/v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: name.trim() }) })
    if (!response.ok) return
    const body = (await response.json()) as { project: ProjectSummary; editorToken: string }
    setFreshToken(body.editorToken)
    setName("")
    await reload()
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("projectsTitle")}</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void create() }}>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("projectNameLabel")}
          <input className="min-h-12 rounded-md border border-[var(--border)] px-3" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <Button type="submit" disabled={name.trim().length === 0}>{t("createProject")}</Button>
      </form>
      {freshToken ? <p className="break-all font-mono text-sm" role="status">{freshToken}</p> : null}
      <ul className="flex flex-col gap-3">
        {projects.map((project) => (
          <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3">
            <span>{project.name}</span>
            <span className="flex flex-wrap gap-2">
              <Button onClick={() => onOpen(project.id, session.token)}>{t("openProject")}</Button>
              <Button variant="quiet" onClick={() => void duplicate(project.id)}>{t("duplicateProject")}</Button>
              <Button variant="quiet" onClick={() => void download(project.id, project.name)}>{t("downloadArchive")}</Button>
              <Button variant="quiet" onClick={() => void remove(project.id)}>{t("deleteProject")}</Button>
            </span>
          </li>
        ))}
      </ul>
      <label className="text-sm">
        {t("importArchive")}
        <input className="mt-1 block" type="file" accept="application/json" onChange={(event) => void importFile(event.target.files?.[0] ?? null)} />
      </label>
      <Button variant="quiet" onClick={onDisconnect}>{t("disconnect")}</Button>
    </main>
  )

  async function duplicate(id: string) {
    const response = await fetch(`${session.server}/api/v1/projects/${id}/duplicate`, { method: "POST", headers })
    if (!response.ok) return
    const body = (await response.json()) as { editorToken: string }
    setFreshToken(body.editorToken)
    await reload()
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return
    await fetch(`${session.server}/api/v1/projects/${id}`, { method: "DELETE", headers })
    await reload()
  }

  async function download(id: string, projectName: string) {
    const response = await fetch(`${session.server}/api/v1/projects/${id}/archive/export`, { method: "POST", headers })
    if (!response.ok) return
    const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${projectName}.cartography.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(file: File | null) {
    if (!file) return
    const archive = JSON.parse(await file.text()) as unknown
    const response = await fetch(`${session.server}/api/v1/projects/archive/import`, { method: "POST", headers, body: JSON.stringify(archive) })
    if (!response.ok) return
    const body = (await response.json()) as { editorToken: string }
    setFreshToken(body.editorToken)
    await reload()
  }
}
