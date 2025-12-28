import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Printer, QrCode, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function QRCodeMesas() {
  const navigate = useNavigate();
  const [numberOfTables, setNumberOfTables] = useState(10);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  const baseUrl = window.location.origin;

  const getTableUrl = (tableNumber: number) => {
    return `${baseUrl}/cliente?mesa=${tableNumber}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSVG = (tableNumber: number) => {
    const svg = document.getElementById(`qr-${tableNumber}`);
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgData], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mesa-${tableNumber}-qrcode.svg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`QR Code da Mesa ${tableNumber} baixado`);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <QrCode className="w-6 h-6" />
              QR Codes das Mesas
            </h1>
            <p className="text-muted-foreground">
              Gere QR Codes para os clientes acessarem o cardápio digital
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="tables">Número de mesas:</Label>
            <Input
              id="tables"
              type="number"
              min={1}
              max={100}
              value={numberOfTables}
              onChange={(e) => setNumberOfTables(parseInt(e.target.value) || 1)}
              className="w-20"
            />
          </div>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir Todos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 print:grid-cols-3">
        {Array.from({ length: numberOfTables }, (_, i) => i + 1).map((tableNumber) => (
          <Card
            key={tableNumber}
            className="text-center print:break-inside-avoid print:shadow-none print:border-2"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Mesa {tableNumber}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-center bg-white p-3 rounded-lg">
                <QRCodeSVG
                  id={`qr-${tableNumber}`}
                  value={getTableUrl(tableNumber)}
                  size={150}
                  level="H"
                  includeMargin
                />
              </div>
              <p className="text-xs text-muted-foreground break-all print:hidden">
                {getTableUrl(tableNumber)}
              </p>
              <p className="text-sm font-medium hidden print:block">
                Escaneie para fazer seu pedido
              </p>
              <div className="flex gap-2 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleDownloadSVG(tableNumber)}
                >
                  <Download className="w-3 h-3 mr-1" />
                  SVG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(getTableUrl(tableNumber));
                    toast.success("Link copiado!");
                  }}
                >
                  Copiar Link
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
