"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Moon, Sun, Download, Play, Square, Target, ClipboardCopy } from "lucide-react"
import { useTheme } from "next-themes"

interface Config {
  names: number
  length: number
  method:
    | "random"
    | "pronounceable"
    | "letters_only"
    | "letters_underline"
    | "numbers_underline"
    | "letters_numbers_underline"
    | "numbers_letters"
  concurrency: number
  birthday: string
}

interface UsernameResult {
  username: string
  status: "valid" | "taken" | "error"
  timestamp: Date
}

export default function RbxNameSniper() {
  const { theme, setTheme } = useTheme()
  const [config, setConfig] = useState<Config>({
    names: 10,
    length: 5,
    method: "random",
    concurrency: 10,
    birthday: "1999-04-20",
  })

  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<UsernameResult[]>([])
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const foundCountRef = useRef(0)
  const logBufferRef = useRef<string[]>([])
  const resultsBufferRef = useRef<UsernameResult[]>([])

  const createLogMessage = (message: string, type: "info" | "success" | "error" = "info") => {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = type === "success" ? "✓" : type === "error" ? "✗" : "•"
    return `[${timestamp}] ${prefix} ${message}`
  }

  useEffect(() => {
    if (!isRunning) return

    const intervalId = setInterval(() => {
      if (logBufferRef.current.length > 0) {
        setLogs(prev => [...prev, ...logBufferRef.current].slice(-200))
        logBufferRef.current = []
      }
      if (resultsBufferRef.current.length > 0) {
        setResults(prev => [...prev, ...resultsBufferRef.current])
        resultsBufferRef.current = []
      }
      setProgress((foundCountRef.current / config.names) * 100)
    }, 250)

    return () => clearInterval(intervalId)
  }, [isRunning, config.names])


  const makeUsername = (config: Config): string => {
    const { length, method } = config

    if (method === "pronounceable") {
      const vowels = "aeiou"
      const consonants = "bcdfghjklmnpqrstvwxyz"
      let username = ""
      for (let i = 0; i < length; i++) {
        username += (i % 2 === 0) 
          ? consonants[Math.floor(Math.random() * consonants.length)]
          : vowels[Math.floor(Math.random() * vowels.length)]
      }
      return username
    } else if (method === "letters_only") {
      const letters = "abcdefghijklmnopqrstuvwxyz"
      return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join("")
    } else if (method.includes("_underline")) {
      const chars = {
        "letters_underline": "abcdefghijklmnopqrstuvwxyz",
        "numbers_underline": "0123456789",
        "letters_numbers_underline": "abcdefghijklmnopqrstuvwxyz0123456789"
      }[method] || ""
      
      if (length < 3) {
        return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
      }

      let username = Array.from({ length: length - 1 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
      const underscorePosition = Math.floor(Math.random() * (length - 2)) + 1
      return username.slice(0, underscorePosition) + "_" + username.slice(underscorePosition)
    } else {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
      return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    }
  }

  const checkUsername = async (username: string, config: Config, signal: AbortSignal): Promise<number | null> => {
    try {
      const url = `/api/validate?username=${encodeURIComponent(username)}&birthday=${encodeURIComponent(config.birthday)}`
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      return data.code
    } catch (error: any) {
      if (error.name === "AbortError") throw error
      return null
    }
  }

  const startGeneration = async () => {
    setResults([])
    setLogs([])
    setProgress(0)
    foundCountRef.current = 0
    logBufferRef.current = []
    resultsBufferRef.current = []
    setIsRunning(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    logBufferRef.current.push(createLogMessage(`Starting generation with ${config.names} target usernames`, "info"))
    logBufferRef.current.push(createLogMessage(`Username length: ${config.length}, Method: ${config.method}`, "info"))
    logBufferRef.current.push(createLogMessage(`Concurrency level set to ${config.concurrency} threads`, "info"))

    let totalAttempts = 0

    const worker = async () => {
      while (foundCountRef.current < config.names && !controller.signal.aborted) {
        totalAttempts++
        const username = makeUsername(config)

        try {
          const code = await checkUsername(username, config, controller.signal)
          if (controller.signal.aborted) break

          if (code === 0) {
            if (foundCountRef.current < config.names) {
              foundCountRef.current++
              const result: UsernameResult = { username, status: "valid", timestamp: new Date() }
              resultsBufferRef.current.push(result)
              logBufferRef.current.push(createLogMessage(`[${foundCountRef.current}/${config.names}] Found: ${username}`, "success"))
            }
          } else if (code !== null) {
            logBufferRef.current.push(createLogMessage(`${username} is taken`, "error"))
          } else {
            logBufferRef.current.push(createLogMessage(`Error checking ${username}`, "error"))
          }
        } catch (error: any) {
          if (error.name !== "AbortError") {
            logBufferRef.current.push(createLogMessage(`Error with ${username}: ${error.message}`, "error"))
          }
        }
      }
    }
    
    try {
        const workers = Array(config.concurrency).fill(null).map(worker)
        await Promise.all(workers)
    } finally {
        setIsRunning(false)
        const finalMessage = controller.signal.aborted
          ? "Generation stopped by user"
          : `Generation complete! Found ${foundCountRef.current} valid usernames out of ${totalAttempts} attempts`;
        
        logBufferRef.current.push(createLogMessage(finalMessage, controller.signal.aborted ? "info" : "success"));

        setLogs(prev => [...prev, ...logBufferRef.current].slice(-200));
        setResults(prev => [...prev, ...resultsBufferRef.current]);
        
        const finalProgress = (foundCountRef.current / config.names) * 100;
        setProgress(finalProgress >= 100 ? 100 : finalProgress);
    }
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const downloadResults = () => {
    const validUsernames = results.filter((r) => r.status === "valid").map((r) => r.username)
    const content = validUsernames.join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "valid_usernames.txt"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copyResults = () => {
    const validUsernames = results.filter((r) => r.status === "valid").map((r) => r.username);
    if (validUsernames.length === 0) return;
    
    const content = validUsernames.join("\n");
    navigator.clipboard.writeText(content).then(() => {
        setLogs(prev => [...prev, createLogMessage(`Copied ${validUsernames.length} valid usernames to clipboard!`, 'success')]);
    }, () => {
        setLogs(prev => [...prev, createLogMessage('Failed to copy usernames.', 'error')]);
    });
  };

  const validCount = results.filter((r) => r.status === "valid").length

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">rbx name sniper</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Sun className="h-4 w-4" />
              <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
              <Moon className="h-4 w-4" />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Set up your username generation parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="names">Target Usernames</Label>
                  <Input
                    id="names"
                    type="number"
                    min="1"
                    max="1000"
                    value={config.names}
                    onChange={(e) => setConfig((prev) => ({ ...prev, names: Number.parseInt(e.target.value) || 10 }))}
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="length">Username Length</Label>
                  <Input
                    id="length"
                    type="number"
                    min="3"
                    max="20"
                    value={config.length}
                    onChange={(e) => setConfig((prev) => ({ ...prev, length: Number.parseInt(e.target.value) || 5 }))}
                    disabled={isRunning}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="method">Generation Method</Label>
                <Select
                  value={config.method}
                  onValueChange={(value: any) => setConfig((prev) => ({ ...prev, method: value }))}
                  disabled={isRunning}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random (letters + numbers)</SelectItem>
                    <SelectItem value="pronounceable">Pronounceable names</SelectItem>
                    <SelectItem value="letters_only">Letters only</SelectItem>
                    <SelectItem value="letters_underline">Letters + underline</SelectItem>
                    <SelectItem value="numbers_underline">Numbers + underline</SelectItem>
                    <SelectItem value="letters_numbers_underline">Letters + numbers + underline</SelectItem>
                    <SelectItem value="numbers_letters">Numbers + letters</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="concurrency">Concurrency (Threads)</Label>
                <Input
                  id="concurrency"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={config.concurrency}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, concurrency: Number.parseInt(e.target.value) || 10 }))
                  }
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthday">Birthday (YYYY-MM-DD)</Label>
                <Input
                  id="birthday"
                  type="date"
                  value={config.birthday}
                  onChange={(e) => setConfig((prev) => ({ ...prev, birthday: e.target.value }))}
                  disabled={isRunning}
                />
              </div>

              <div className="flex gap-2">
                {!isRunning ? (
                  <Button onClick={startGeneration} className="flex-1">
                    <Play className="h-4 w-4 mr-2" />
                    Start Generation
                  </Button>
                ) : (
                  <Button onClick={stopGeneration} variant="destructive" className="flex-1">
                    <Square className="h-4 w-4 mr-2" />
                    Stop Generation
                  </Button>
                )}

                {validCount > 0 && !isRunning && (
                  <>
                    <Button onClick={copyResults} variant="outline">
                      <ClipboardCopy className="h-4 w-4 mr-2" />
                      Copy ({validCount})
                    </Button>
                    <Button onClick={downloadResults} variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download ({validCount})
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Results
                <div className="flex gap-2">
                  <Badge variant="secondary">{validCount} Valid</Badge>
                </div>
              </CardTitle>
              <CardDescription>
                {isRunning ? "Generation in progress..." : "Username generation results"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRunning && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Activity Log</Label>
                <div className="h-64 overflow-y-auto border rounded-md p-3 bg-muted/50">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No activity yet...</p>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log, index) => (
                        <div key={index} className="text-xs font-mono">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Valid Usernames Found</Label>
                <div className="h-32 overflow-y-auto border rounded-md p-3">
                  {validCount === 0 ? (
                    <p className="text-muted-foreground text-sm">No valid usernames found yet...</p>
                  ) : (
                    <div className="space-y-1">
                      {results
                        .filter((r) => r.status === "valid")
                        .map((result, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <span className="font-mono">{result.username}</span>
                            <Badge variant="secondary" className="text-xs">
                              Valid
                            </Badge>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
