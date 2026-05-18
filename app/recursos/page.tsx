import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from '@/components/ui/navigation-menu';
import { Pagination } from '@/components/ui/pagination';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const CATEGORIAS = [
  { key: 'colores', label: 'Colores' },
  { key: 'accion', label: 'Acción' },
  { key: 'datos', label: 'Datos' },
  { key: 'navegacion', label: 'Navegación' },
  { key: 'formulario', label: 'Formulario' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'otros', label: 'Otros' },
];

export default function ShowcasePage() {
  return (
    <div className="p-8 bg-ja-background text-ja-text">
      {/* Menú de Tabs para navegar por categorías */}
      <Tabs defaultValue="accion" className="w-full">
        <TabsList className="mb-8">
          {CATEGORIAS.map((cat) => (
            <TabsTrigger key={cat.key} value={cat.key}>
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Categoría: Colores */}
        <TabsContent value="colores">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Colores Base</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-primary border flex items-center justify-center text-primary-foreground font-bold">
                      P
                    </div>
                    <span className="font-mono">primary</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-secondary border flex items-center justify-center text-secondary-foreground font-bold">
                      S
                    </div>
                    <span className="font-mono">secondary</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-destructive border flex items-center justify-center text-destructive-foreground font-bold">
                      D
                    </div>
                    <span className="font-mono">destructive</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-muted border flex items-center justify-center text-muted-foreground font-bold">
                      M
                    </div>
                    <span className="font-mono">muted</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-accent border flex items-center justify-center text-accent-foreground font-bold">
                      A
                    </div>
                    <span className="font-mono">accent</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-background border" />
                    <span className="font-mono">background</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Colores de Componentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Estos componentes usan las variables de color para su tema.
                </p>
                <Card>
                  <CardHeader>
                    <CardTitle>Ejemplo de Card</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>Este componente usa los colores `card` y `card-foreground`.</p>
                  </CardContent>
                </Card>
                <div className="space-y-2">
                  <Label>Ejemplo de Input</Label>
                  <Input placeholder="Usa 'border', 'input' y 'ring' en foco" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categoría: Acción */}
        <TabsContent value="accion">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Ejemplo: Botón con variantes */}
            <Card>
              <CardHeader>
                <CardTitle>Botón</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button>Primario</Button>
                <Button variant="secondary">Secundario</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="destructive">Destructivo</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </CardContent>
            </Card>
            {/* Badge */}
            <Card>
              <CardHeader>
                <CardTitle>Insignia (Badge)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secundaria</Badge>
                <Badge variant="destructive">Destructiva</Badge>
                <Badge variant="outline">Outline</Badge>
              </CardContent>
            </Card>
            {/* Checkbox */}
            <Card>
              <CardHeader>
                <CardTitle>Checkbox</CardTitle>
              </CardHeader>
              <CardContent>
                <Checkbox id="checkbox-demo" /> <Label htmlFor="checkbox-demo">Ejemplo</Label>
              </CardContent>
            </Card>
            {/* AlertDialog */}
            <Card>
              <CardHeader>
                <CardTitle>Diálogo de alerta</CardTitle>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button>Mostrar alerta</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                    <AlertDialogAction>Aceptar</AlertDialogAction>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
            {/* Avatar */}
            <Card>
              <CardHeader>
                <CardTitle>Avatar</CardTitle>
              </CardHeader>
              <CardContent>
                <Avatar>
                  <AvatarImage src="https://i.pravatar.cc/100" alt="Avatar" />
                  <AvatarFallback>AB</AvatarFallback>
                </Avatar>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categoría: Datos */}
        <TabsContent value="datos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card */}
            <Card>
              <CardHeader>
                <CardTitle>Tarjeta (Card)</CardTitle>
              </CardHeader>
              <CardContent>
                <CardTitle>Título</CardTitle>
                <p>Contenido de ejemplo</p>
              </CardContent>
            </Card>
            {/* Calendar */}
            <Card>
              <CardHeader>
                <CardTitle>Calendario</CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar />
              </CardContent>
            </Card>
            {/* Progress */}
            <Card>
              <CardHeader>
                <CardTitle>Progreso</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={50} />
              </CardContent>
            </Card>
            {/* Carousel (ejemplo simple) */}
            <Card>
              <CardHeader>
                <CardTitle>Carrusel</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Aquí podrías agregar un ejemplo de Carousel si tienes imágenes o contenido */}
                <span>Ejemplo de carrusel</span>
              </CardContent>
            </Card>
            {/* Pagination */}
            <Card>
              <CardHeader>
                <CardTitle>Paginación</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Ejemplo simple de paginación */}
                <Pagination>
                  <nav className="flex gap-2">
                    <Button variant="outline" size="sm">
                      {'<'}
                    </Button>
                    <Button variant="default" size="sm">
                      1
                    </Button>
                    <Button variant="ghost" size="sm">
                      2
                    </Button>
                    <Button variant="ghost" size="sm">
                      3
                    </Button>
                    <Button variant="outline" size="sm">
                      {'>'}
                    </Button>
                  </nav>
                </Pagination>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categoría: Navegación */}
        <TabsContent value="navegacion">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Menubar */}
            <Card>
              <CardHeader>
                <CardTitle>Menú de barra</CardTitle>
              </CardHeader>
              <CardContent>
                <Menubar>
                  <MenubarMenu>
                    <MenubarTrigger>Archivo</MenubarTrigger>
                    <MenubarContent>
                      <MenubarItem>Nuevo</MenubarItem>
                      <MenubarItem>Abrir</MenubarItem>
                    </MenubarContent>
                  </MenubarMenu>
                </Menubar>
              </CardContent>
            </Card>
            {/* NavigationMenu */}
            <Card>
              <CardHeader>
                <CardTitle>Menú de navegación</CardTitle>
              </CardHeader>
              <CardContent>
                <NavigationMenu>
                  <NavigationMenuList>
                    <NavigationMenuItem>
                      <NavigationMenuTrigger>Menú</NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <span>Contenido</span>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  </NavigationMenuList>
                </NavigationMenu>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categoría: Formulario */}
        <TabsContent value="formulario">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Input */}
            <Card>
              <CardHeader>
                <CardTitle>Input</CardTitle>
              </CardHeader>
              <CardContent>
                <Input placeholder="Escribe algo..." />
              </CardContent>
            </Card>
            {/* Label */}
            <Card>
              <CardHeader>
                <CardTitle>Etiqueta (Label)</CardTitle>
              </CardHeader>
              <CardContent>
                <Label htmlFor="input-demo">Nombre</Label>
                <Input id="input-demo" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categoría: Feedback */}
        <TabsContent value="feedback">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Dialog */}
            <Card>
              <CardHeader>
                <CardTitle>Diálogo</CardTitle>
              </CardHeader>
              <CardContent>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Mostrar diálogo</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogTitle>Ejemplo de diálogo</DialogTitle>
                    <DialogDescription>Este es un diálogo simple.</DialogDescription>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
            {/* Popover */}
            <Card>
              <CardHeader>
                <CardTitle>Popover</CardTitle>
              </CardHeader>
              <CardContent>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button>Mostrar popover</Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <span>Contenido del popover</span>
                  </PopoverContent>
                </Popover>
              </CardContent>
            </Card>
            {/* RadioGroup */}
            <Card>
              <CardHeader>
                <CardTitle>Grupo de radio</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup defaultValue="opcion1">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="opcion1" id="radio1" />
                    <Label htmlFor="radio1">Opción 1</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="opcion2" id="radio2" />
                    <Label htmlFor="radio2">Opción 2</Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categoría: Otros */}
        <TabsContent value="otros">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Carousel */}
            <Card>
              <CardHeader>
                <CardTitle>Carrusel (Carousel)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative w-full max-w-md mx-auto">
                  <Carousel>
                    <CarouselContent>
                      <CarouselItem className="bg-gradient-to-r from-primary to-secondary">
                        <div className="flex h-32 items-center justify-center rounded-lg text-white font-bold">
                          Slide 1
                        </div>
                      </CarouselItem>
                      <CarouselItem className="bg-gradient-to-r from-accent to-blue-400">
                        <div className="flex h-32 items-center justify-center rounded-lg text-white font-bold">
                          Slide 2
                        </div>
                      </CarouselItem>
                      <CarouselItem className="bg-gradient-to-r from-green-500 to-teal-500">
                        <div className="flex h-32 items-center justify-center rounded-lg text-white font-bold">
                          Slide 3
                        </div>
                      </CarouselItem>
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
