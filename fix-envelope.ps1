# Envelope fix: admin/provider list pages read `res.data.items` / `res.data.pagination.total`
# but the API contract (paginated() + Envelope<T> + useApi + account views) is
# `{ data: T[], pagination }`. Fix each page to the real flat envelope.
# UTF-8 (no BOM) preserved via .NET writers; literal (non-regex) replacements.

$ErrorActionPreference = 'Stop'

$fixes = @(
  @{ Path = 'src\app\[locale]\admin\users\page.tsx';        Type = 'User' },
  @{ Path = 'src\app\[locale]\admin\reviews\page.tsx';      Type = 'Review' },
  @{ Path = 'src\app\[locale]\admin\places\page.tsx';       Type = 'Place' },
  @{ Path = 'src\app\[locale]\admin\payments\page.tsx';     Type = 'Payment' },
  @{ Path = 'src\app\[locale]\admin\media\page.tsx';        Type = 'Media' },
  @{ Path = 'src\app\[locale]\admin\content\page.tsx';      Type = 'Content' },
  @{ Path = 'src\app\[locale]\admin\businesses\page.tsx';   Type = 'Business' },
  @{ Path = 'src\app\[locale]\admin\bookings\page.tsx';     Type = 'Booking' },
  @{ Path = 'src\app\[locale]\admin\audit\page.tsx';        Type = 'AuditEntry' },
  @{ Path = 'src\app\[locale]\admin\approvals\page.tsx';    Type = 'ApprovalItem' },
  @{ Path = 'src\app\[locale]\provider\services\page.tsx';  Type = 'Bookable' },
  @{ Path = 'src\app\[locale]\provider\reviews\page.tsx';   Type = 'Review' },
  @{ Path = 'src\app\[locale]\provider\bookings\page.tsx';  Type = 'Booking' }
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$failures = @()

foreach ($fix in $fixes) {
  $path = Join-Path $PSScriptRoot $fix.Path
  $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $original = $text

  $repls = @(
    @{ From = 'import { PaginationMeta } from "@/lib/api/client";'; To = ''; Regex = $true },
    @{ From = ('apiFetch<{ items: ' + $fix.Type + '[]; pagination: PaginationMeta }>'); To = ('apiFetch<' + $fix.Type + '[]>') },
    @{ From = 'setItems(res.data.items);'; To = 'setItems(res.data ?? []);' },
    @{ From = 'setTotal(res.data.pagination.total);'; To = 'setTotal(res.pagination?.total ?? 0);' }
  )

  foreach ($r in $repls) {
    if ($r.Regex) {
      $pattern = [regex]::Escape($r.From) + '\r?\n'
      $count = ([regex]::Matches($text, $pattern)).Count
      if ($count -ne 1) {
        $failures += "$($fix.Path): expected 1 match for '$($r.From)', found $count"
      }
      $text = [regex]::Replace($text, $pattern, '')
    } else {
      $count = ([regex]::Matches($text, [regex]::Escape($r.From))).Count
      if ($count -ne 1) {
        $failures += "$($fix.Path): expected 1 match for '$($r.From)', found $count"
      }
      $text = $text.Replace($r.From, $r.To)
    }
  }

  if ($text -ne $original) {
    [System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
    Write-Output "FIXED: $($fix.Path)"
  }
}

if ($failures.Count -gt 0) {
  Write-Output '--- FAILURES ---'
  $failures | ForEach-Object { Write-Output $_ }
  exit 1
}
Write-Output 'ALL OK'
