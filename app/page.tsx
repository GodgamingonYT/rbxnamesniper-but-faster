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
  
  // -- Configuration State --
  const [config, setConfig] = useState<Config>({
    names: 10,
    length: 5,
    method: "random",
    concurrency: 5, // Lowered default concurrency for stability
    birthday: "1999-04-20",
  })

  // -- Operational State --
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<UsernameResult[]>([])
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  
  // -- Refs for High-Frequency Updates --
  const abortControllerRef = useRef<AbortController | null>(null)
  const foundCountRef = useRef(0)
  const logBufferRef = useRef<string[]>([])
  const resultsBufferRef = useRef<UsernameResult[]>([])
  const logContainerRef = useRef<HTMLDivElement>(null)

  // -- Helper: Format Log Messages --
  const createLogMessage = (message: string, type: "info" | "success" | "error" = "info") => {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = type === "success" ? "✓" : type === "error" ? "✗" : "•"
    return `[${timestamp}] ${prefix} ${message}`
  }

  // -- Effect: Auto-scroll Logs --
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // -- Effect: Flush Buffers to State --
  // This runs on an interval to prevent re-rendering React 1000 times a second
  useEffect(() => {
    let intervalId: NodeJS.Timeout

    if (isRunning) {
      intervalId = setInterval(() => {
        // Flush Logs
        if (logBufferRef.current.length > 0) {
          setLogs(prev => {
            // Keep only the last 200 logs to prevent memory issues
            const newLogs = [...prev, ...logBufferRef.current]
            return newLogs.slice(-200)
          })
          logBufferRef.current = []
        }

        // Flush Results
        if (resultsBufferRef.current.length > 0) {
          setResults(prev => [...prev, ...resultsBufferRef.current])
          resultsBufferRef.current = []
        }

        // Update Progress
        setProgress(Math.min((foundCountRef.current / config.names) * 100, 100))
      }, 100) // Update UI every 100ms
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [isRunning, config.names])


  // -- Logic: Name Generators --
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

  // -- Logic: API Check --
  const checkUsername = async (username: string, config: Config, signal: AbortSignal): Promise<number | null> => {
    try {
      // NOTE: Ensure this API endpoint actually exists in your Next.js app 
      // at app/api/validate/route.ts or pages/api/validate.ts
      const url = `/api/validate?username=${encodeURIComponent(username)}&birthday=${encodeURIComponent(config.birthday)}`
      
      const response = await fetch(url, { 
        signal,
        headers: { 'Content-Type': 'application/json' } 
      })

      if (!response.ok) {
        // Handle non-200 responses (like 404 if API is missing)
        throw new Error(`HTTP ${response.status}`)
      }
      
      const data = await response.json()
      return data.code
    } catch (error: any) {
      if (error.name === "AbortError") throw error
      
      // If the API is missing (404), we return a specific null to handle it gracefully in the worker
      return null
    }
  }

  // -- Logic: Main Generator Loop --
  const startGeneration = async () => {
    // Reset State
    setResults([])
    setLogs([])
    setProgress(0)
    foundCountRef.current = 0
    logBufferRef.current = []
    resultsBufferRef.current = []
    
    // Start State
    setIsRunning(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Initial Logs
    logBufferRef.current.push(createLogMessage(`Initializing sniper...`, "info"))
    logBufferRef.current.push(createLogMessage(`Target: ${config.names} valid names`, "info"))
    logBufferRef.current.push(createLogMessage(`Method: ${config.method}, Length: ${config.length}`, "info"))

    // Force an immediate state update for initial logs
    setLogs([...logBufferRef.current])
    logBufferRef.current = []

    let totalAttempts = 0

    // The Worker Function
    const worker = async (workerId: number) => {
      while (foundCountRef.current < config.names && !controller.signal.aborted) {
        totalAttempts++
        const username = makeUsername(config)

        try {
          // ARTIFICIAL DELAY: Crucial to prevent UI freezing and allow React to render updates
          await new Promise(r => setTimeout(r, 50 + (Math.random() * 50)))

          const code = await checkUsername(username, config, controller.signal)
          
          if (controller.signal.aborted) break

          if (code === 0) {
            // Success
            if (foundCountRef.current < config.names) {
              foundCountRef.current++
              const result: UsernameResult = { username, status: "valid", timestamp: new Date() }
              resultsBufferRef.current.push(result)
              logBufferRef.current.push(createLogMessage(`[Found] ${username}`, "success"))
            }
          } else if (code !== null) {
            // Taken (assuming non-zero code means taken)
            logBufferRef.current.push(createLogMessage(`${username} : Taken (Code ${code})`, "info"))
          } else {
            // API Error / Null
            logBufferRef.current.push(createLogMessage(`${username} : Check Failed (API Error)`, "error"))
            // Slow down significantly if API is failing to prevent spamming logs
            await new Promise(r => setTimeout(r, 1000))
          }
        } catch (error: any) {
          if (error.name !== "AbortError") {
            logBufferRef.current.push(createLogMessage(`System Error: ${error.message}`, "error"))
          }
        }
      }
    }
    
    try {
        const workers = Array.from({ length: config.concurrency }, (_, i) => worker(i))
        await Promise.all(workers)
    } finally {
        setIsRunning(false)
        
        const aborted = controller.signal.aborted
        const finalMessage = aborted
          ? "Process stopped by user."
          : `Complete! Found ${foundCountRef.current} valid names.`
        
        // Final flush
        setLogs(prev => {
           const finalLogs = [...prev, ...logBufferRef.current, createLogMessage(finalMessage, aborted ? "info" : "success")]
           return finalLogs.slice(-200)
        })
        setResults(prev => [...prev, ...resultsBufferRef.current])
        setProgress(aborted ? (foundCountRef.current / config.names) * 100 : 100)
    }
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      logBufferRef.current.push(createLogMessage("Stopping...", "error"))
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
        setLogs(prev => [...prev, createLogMessage(`Copied ${validUsernames.length} usernames`, 'success')]);
    }, () => {
        setLogs(prev => [...prev, createLogMessage('Clipboard access denied', 'error')]);
    });
  };

  const validCount = results.filter((r) => r.status === "valid").length

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Rbx Name Sniper</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2 bg-secondary/50 p-1 rounded-full">
              <Sun className="h-4 w-4 ml-1" />
              <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
              <Moon className="h-4 w-4 mr-1" />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* CONFIGURATION CARD */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Setup generation parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="names">Target Amount</Label>
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
                  <Label htmlFor="length">Name Length</Label>
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
                <Label htmlFor="method">Pattern Method</Label>
                <Select
                  value={config.method}
                  onValueChange={(value: any) => setConfig((prev) => ({ ...prev, method: value }))}
                  disabled={isRunning}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random (A-Z, 0-9)</SelectItem>
                    <SelectItem value="pronounceable">Pronounceable (CVC)</SelectItem>
                    <SelectItem value="letters_only">Letters Only</SelectItem>
                    <SelectItem value="letters_underline">Letters + Underscore</SelectItem>
                    <SelectItem value="numbers_underline">Numbers + Underscore</SelectItem>
                    <SelectItem value="letters_numbers_underline">Mixed + Underscore</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="concurrency">Threads (Concurrency)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="concurrency"
                    type="number"
                    min="1"
                    max="50"
                    value={config.concurrency}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, concurrency: Number.parseInt(e.target.value) || 5 }))
                    }
                    disabled={isRunning}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Rec: 5-10
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {!isRunning ? (
                  <Button onClick={startGeneration} className="flex-1 font-semibold">
                    <Play className="h-4 w-4 mr-2" />
                    Start
                  </Button>
                ) : (
                  <Button onClick={stopGeneration} variant="destructive" className="flex-1 font-semibold">
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* RESULTS CARD */}
          <Card className="flex flex-col shadow-lg h-[600px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                Live Feed
                <Badge variant={isRunning ? "default" : "secondary"}>
                  {isRunning ? "Running" : "Idle"}
                </Badge>
              </CardTitle>
              {isRunning && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
              
              {/* LOG WINDOW */}
              <div className="flex-1 min-h-0 flex flex-col space-y-2">
                <Label>Console Log</Label>
                <div 
                  ref={logContainerRef}
                  className="flex-1 overflow-y-auto border rounded-md p-3 bg-zinc-950 text-green-400 font-mono text-xs shadow-inner"
                >
                  {logs.length === 0 ? (
                    <p className="text-zinc-600 italic">Waiting to start...</p>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap leading-tight py-0.5">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* FOUND LIST */}
              <div className="h-1/3 min-h-[150px] flex flex-col space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Valid Hits ({validCount})</Label>
                    <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copyResults} disabled={validCount === 0}>
                            <ClipboardCopy className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={downloadResults} disabled={validCount === 0}>
                            <Download className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto border rounded-md p-2 bg-secondary/20">
                  {validCount === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      No hits yet
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {results
                        .filter((r) => r.status === "valid")
                        .map((result, index) => (
                          <div key={index} className="flex items-center justify-between bg-background p-2 rounded border text-xs">
                            <span className="font-bold text-primary truncate">{result.username}</span>
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
