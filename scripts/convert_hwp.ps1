param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [ValidateSet('HWP','PDF')][string]$Format = 'HWP',
  [ValidateSet('','HWPX','DOCX')][string]$InputFormat = '',
  [string]$EquationManifest = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$hwpInstance = $null
try {
  $resolvedInput = (Resolve-Path -LiteralPath $InputFile).Path
  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputFile)
  $hwpType = [Type]::GetTypeFromProgID('HWPFrame.HwpObject')
  if ($null -eq $hwpType) { throw '설치된 한글 자동화 기능을 찾을 수 없습니다.' }
  $hwpInstance = [Activator]::CreateInstance($hwpType)
  try { $hwpInstance.XHwpWindows.Item(0).Visible = $true } catch {}
  # Hancom directs DOCX to Hanword by default; insert:true keeps the import in this own HWP instance.
  $opened = $hwpInstance.Open($resolvedInput, $InputFormat, 'insert:true')
  if (-not $opened) { throw '한글에서 변환용 문서를 열지 못했습니다.' }
  if ($EquationManifest) {
    $manifest = Get-Content -LiteralPath $EquationManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version -ne 1 -or $null -eq $manifest.equations) { throw '한글 수식 목록이 잘못되었습니다.' }
    foreach ($equation in $manifest.equations) {
      [void]$hwpInstance.HAction.Run('MoveDocBegin')
      $find = $hwpInstance.CreateAction('RepeatFind')
      $findSet = $find.CreateSet()
      [void]$find.GetDefault($findSet)
      $findSet.SetItem('FindString', [string]$equation.marker)
      $findSet.SetItem('Direction', 0)
      $findSet.SetItem('FindType', 1)
      $findSet.SetItem('IgnoreMessage', 1)
      $findSet.SetItem('FindRegExp', 0)
      $findSet.SetItem('UseWildCards', 0)
      if (-not $find.Execute($findSet)) { throw '한글 변환 중 수식의 위치를 찾지 못했습니다.' }
      [void]$hwpInstance.HAction.Run('Delete')
      $create = $hwpInstance.CreateAction('EquationCreate')
      $equationSet = $create.CreateSet()
      [void]$create.GetDefault($equationSet)
      $equationSet.SetItem('String', [string]$equation.script)
      $equationSet.SetItem('BaseUnit', [int]($equation.fontPt * 100))
      $equationSet.SetItem('EqFontName', 'HYhwpEQ')
      if (-not $create.Execute($equationSet)) { throw '편집 가능한 한글 수식을 만들지 못했습니다.' }
      [void]$hwpInstance.HAction.Run('Cancel')
    }
    # The imported floating Word header picture otherwise flows with each
    # column and can cross body text. Header drawings in Hancom 2018 use the
    # header origin even when imported as Paper-relative. Use that explicit
    # origin, behind text. COLUMNLINE disappears on half-empty answer pages.
    [xml]$nativeXml = $hwpInstance.GetTextFile('HWPML2X', '')
    foreach ($section in $nativeXml.SelectNodes('//BODY/SECTION')) {
      $page = $section.SelectSingleNode('.//PAGEDEF')
      if ($null -eq $page) { throw '한글의 쪽 크기를 확인하지 못했습니다.' }
      $dividers = @($section.SelectNodes('.//HEADER//PICTURE') | Where-Object {
        $size = $_.SelectSingleNode('SHAPEOBJECT/SIZE')
        $null -ne $size -and [int]$size.Width -eq 100 -and [int]$size.Height -gt 70000
      })
      if ($dividers.Count -ne 1) { throw '한글의 중앙 구분선을 확인하지 못했습니다.' }
      foreach ($divider in $dividers) {
        $shape = $divider.SelectSingleNode('SHAPEOBJECT')
        $shape.SetAttribute('TextWrap', 'BehindText')
        $position = $shape.SelectSingleNode('POSITION')
        $position.SetAttribute('FlowWithText', 'false')
        $margins = $page.SelectSingleNode('PAGEMARGIN')
        $position.SetAttribute('HorzRelTo', 'Para')
        $position.SetAttribute('VertRelTo', 'Para')
        $position.SetAttribute('HorzOffset', [string]([int](([int]$page.Width - [int]$margins.Left - [int]$margins.Right) / 2) - 50))
        $position.SetAttribute('VertOffset', [string]$margins.Header)
        $position.SetAttribute('TreatAsChar', 'false')
      }
      foreach ($line in @($section.SelectNodes('.//COLDEF/COLUMNLINE'))) { [void]$line.ParentNode.RemoveChild($line) }
    }
    if (-not $hwpInstance.SetTextFile($nativeXml.OuterXml, 'HWPML2X', '')) { throw '한글의 최종 쪽 배치를 적용하지 못했습니다.' }
  }
  $saved = $hwpInstance.SaveAs($resolvedOutput, $Format, '')
  if (-not $saved -or -not (Test-Path -LiteralPath $resolvedOutput)) { throw '한글 문서 저장을 완료하지 못했습니다.' }
  @{ path=$resolvedOutput; format=$Format } | ConvertTo-Json -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($null -ne $hwpInstance) {
    try { $hwpInstance.Quit() } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwpInstance) } catch {}
  }
}
