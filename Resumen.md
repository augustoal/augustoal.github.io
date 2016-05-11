######<p style="text-align: right;">Augusto Ariztía Léniz</p>
#<center>Programación Avanzada

El siguiente texto trata de ser un resumen del ramo IIC2233 - Programación Avanzada. Casi toda la información y ejemplos que se usan fueron sacados del material de clases del primer semestre del año 2016 con los profesor Karim Pichara y Christian Pieringer.


##Índice

####1. [**Programación Orientada al Objeto**](#oop)
####2. [**Estructuras de Datos**](#edd)
####3. [**Functional**](#functional)
####4. [**Metaclases**](#metaclases)
####5. [**Excepciones**](#excepciones)
####6. [**Testing**](#testing)
####7. [**Simulación**](#simulacion)
####8. [**Threading**](#threading)

##1. <a name="oop"></a>Programación Orientada al Objeto
###1.1 <a name="objetos"></a>Objetos
Los objetos en la programación son un conjunto de datos que tienen características y acciones parecidas. En python estos se trabajan usando **clases**. Cada clase representa un "tipo de objeto", y cada vez que creamos un objeto este tiene que ser de una clase, se dice que se creó una **instancia** de la clase. La programación orientada al objeto busca trabajar con la interacción de distintos objetos segun sus características y acciones. 

Veamos un ejemplo, vamos a crear la clase "Cuadro":

~~~python
class Cuadro:
	def __init__(autor, dueño)	#atributos
		self.autor = autor
		self.dueño = dueño
	def vender_a(persona) #método
		self.dueño = persona
		
mona_lisa = Cuadro("Da Vinci","Da Vinci") #instanciamos la clase y creamos un cuadro
mona_lisa.vender_a("Juan") #usamos el método vender_a y ahora el nuevo dueño de la obra es Juan
~~~
Si queremos saber más información sobre una clase tenemos que usar la función "help", por ejemplo si queremos saber más sobre la clase cuadro ```help(Cuadro)```.
Para evitar que se pueda acceder directamente a un atributo, o un método, hay que hacerlo privado, eso se hace defininiéndolo con un "_" primero, o doble si queremos que sea más difícil, pero hay que tener en cuenta que siempre se va a poder acceder de alguna manera.

###1.2 Herencia
La herencia es una relación de especialización entre clases. Una clase _hereda_ los atributos y métodos de una "super clase". Además puede definir los suyos propios y/o cambiarlos. Cambiar un método de la super clase se llama _overriding_. Para crear una clase que hereda de una superclase se hace:

```python
class Clase(SuperClase):
```
Cuando se hereda de más de una clase podemos tener el problema del diamante, en el que terminamos llamando dos veces a una clase más alta. En Python esto pasa porque todas las clases heredan de ```object```. Para evitarlo, al instanciar una clase llamamos al método ```super()``` y Python automáticamente va a la clase que sigue para arriba. Para ver la jerarquía de las clases de la cual hereda nuestra clase usamos ```NombreClase.__mro__```.
####Uso de *args y **kwargs
Los args y los kwargs sirven para pasarle a una funcion una cantidad variable de datos, como tambien para poder pasarle listas o tuplas.
Si no sabemos cuantos datos le vamos a pasar a la función, la podemos crear de la forma ```def funcion(*args) ``` y despues trabajar con args. 

Si tenemos una función con X argumentos y queremos llamarla usando una lista de X elementos, tenemos que llamarla así: ```funcion(*lista)``` de esta forma cada elemento de la lista sería un argumento. Si quisieramos hacer lo mismo con un diccionario en vez de una lista, la forma de llamarla sería ```funcion(**diccionario)```.

###1.3 Polimorfismo

El polimorfismo se da cuando existen distintas subclases que tienen el mismo método pero implementado de distinta forma. Existen dos tipos: **overriding** y **overloading**. El primero se da cuando el método creado en una subclase invalida el de la super clase, así cuando lo llamo desde un objeto de esa subclase se ejecuta el método nuevo y no el original. El segundo se da cuando el método tiene el mismo nombre pero en realidad es una función completamente distinta. Por lo que la acción que haga el método cuando lo llame va a depender del objeto sobre el cual estoy trabajando.

En Python se puede hacer overriding de operadores y funciones, estos son algunos casos:

* ```__add__()``` -> ```+```
* ```__sub__()``` -> ```-```
* ```__lt__()``` -> ```<```
* ```__gt__()``` -> ```>```
* ```__eq__()``` -> ```==```
* ```__repr__()``` -> ```print()```

Al crear una clase estos métodos deben ser implementados y ahí definir que se quiere hacer cuando se llamen.

###1.4 Properties

Las properties nos permiten usar los métodos como si fueran atributos. Sirven cuando tengo un atributo privado (ver [1.1](#objetos)) y queremos hacer una forma de acceder a él y/o cambiar su valor. Una forma de usarlas es:

```python
class Email:
    def __init__(self, address):
        self._email = address
        
    def _set_email(self, value):
        if '@' not in value:
            print("Esto no parece una dirección de correo.")
        else:
            self._email = value

    def _get_email(self):
        return self._email
    
    def _del_email(self):
        print("Eliminaste el correo!!")
        del self._email    

    email = property(_get_email, _set_email, _del_email, "Esta propiedad corresponde al correo...")
```
A primera vista puede no notarse su utilidad, pero veamos 3 situaciones:

1. ``print(objeto._email)`` Ya que tenemos la property definida, python se da cuenta cuando queremos acceder al atributo ```_email``` y entonces usa el método ```_get_email```
2. ```objeto._email = "mail nuevo"``` Pasa lo mismo de antes, python se da cuenta que queremos setear el atributo ``_email`` y usa el método ```_set_email```.
3. ```del objeto._email``` Python ve que queremos borrar el atributo y entonces llama al método ```_del_email```.

Otra forma de usar las properties es usando decoradores (más información más adelante):

```python
class Color:
    
    def __init__(self, rgb_code, nombre):
        self.rgb_code = rgb_code
        self._nombre = nombre
    
    @property 
    def nombre(self):
        return self._nombre
        
    @nombre.setter    
    def nombre(self, valor):
        self._nombre = valor
        
    @nombre.deleter
    def nombre(self):
        del self._nombre
```
Funciona igual que el ejemplo anterior, solo que no tuvimos que definir la property, solo le pusimos los decoradores (los nombres con @) a cada método. Entonces, por ejemplo, cuando queremos setear el atributo nombre, Python (por el decorador ```@nombre.setter```) sabe que tiene que llamar a ese método.

###1.5 Clases Abstractas

Las clases abstractas son aquellas que se refieren a conceptos que también son abstractos. Esa explicación no tiene ningún sentido, por lo que es mejor verlo con un ejemplo. Si tenemos una clase ```Animal``` no tendría mucho sentido instanciarla, si tendría sentido, en cambio, instanciar la clase ```Perro(Animal)``` porque ahí ya sabemos más características específicas del tipo de animal y podemos trabajar con ellas. Las clases abstractas entonces, no estan pensadas para ser instanciadas, sino que para heredar de ellas. Así tambien, uno puede crear métodos que solo funcionen si se les hace _overriding_ (ver ```@abstractmethod``` en el próximo ejemplo).
Una forma más cómoda de trabajar con clases abstractas es usando el módulo ```abc``` como en el ejemplo siguiente:

```python
from abc import ABCMeta, abstractmethod

class Base(metaclass=ABCMeta):
    @abstractmethod
    def func_1(self):
        pass

    @abstractmethod
    def func_2(self):
        pass

class SubClase(Base):
    def func_1(self):
        pass
```
De esta forma si tratamos de instanciar la clase ```Base``` o de llamar al método ```func_2``` desde la subclase, nos sale un error. 

###1.6 Diagramas de clases
Los diagramas de clases permiten ver de una forma gráfica las características de una clase (métodos y atributos) y su interacción con otras.

Las clases se representan así:

![clase](/Users/Augusto/Downloads/syllabus-master/Material-de-clases/01-OOP/imgs_uml/UML_class.png)

Las interacciones más comunes son de **composición**, **agregación** y **herencia**:

I) **Composición**: Una clase usa objetos de otra y su tiempo de vida depende de esta otra, se representa de la siguiente forma:

![composicion](/Users/Augusto/Downloads/syllabus-master/Material-de-clases/01-OOP/imgs_uml/UML_composition.png)

II) **Agregación**: Casi igual a la composición, la unica diferencia es que los tiempos de vida de las clases son independientes. Se representa:

![agregacion](/Users/Augusto/Downloads/syllabus-master/Material-de-clases/01-OOP/imgs_uml/UML_aggregation.png)

Como se puede haber notado, las flechas incluyen numeros, estos significan:

* 1..* pueden haber uno o más clases
* 0..* pueden haber cero o más clases
* n solo pueden haber n clases

III) **Herencia**: Lo mismo explicado anteriormente en 1.2. Se representa:

![herencia](/Users/Augusto/Downloads/syllabus-master/Material-de-clases/01-OOP/imgs_uml/UML_inheritance.png)

##2. <a name="edd"></a>Estructuras de Datos

###2.1 Introduccion
Las estructuras de datos son distintas formas de agrupar información. La estructura de datos más simple es una clase vacía, a la cual después se le agregan atributos. Claramente esta no es la forma más eficiente de trabajar. En Python hay varios tipos de estructuras distintas, y la elección de una depende de lo que queramos hacer.
#####2.1.1 Estructuras secuenciales basadas en arreglos
Son estructuras que básicamente ordenan varios elementos en una secuencia según el orden en que fueron agregados. Se puede acceder a un elemento segun el índice de su lugar, estos parten del 0 hasta el (largo del arreglo -1). Dentro de esta categoría están los _strings_, las _tuplas_ y las _listas_.

* **Strings**: Se consideran normalmente más un tipo de variable que una estructura de datos. Son inmutables, es decir, una vez que se creó no se puede cambiar el orden de sus elementos. Para crear un string se escribe la información entre comillas o se usa ```str(informacion)```.
* **Tuplas**: También son inmutables como los strings, aunque su funcionamiento se parece más a las listas. Ordenan datos que pueden ser de cualquier tipo, no solo un caracter (como los strings). Para crear una tupla se pueden poner los elementos de la forma ```nombre_tupla = (item1, item2, item3)``` o usar ```tuple(información)```.
Dentro de las tuplas podemos nombrar las **NamedTuples**, que son tuplas con un nombre asignado a cada lugar. Son una forma de trabajar en situaciones donde una clase podría ser útil pero no se quiere usar tanta memoria. Se usan de esta forma:

```python
from collections import namedtuple

Register = namedtuple('Register', 'RUT name age')

c1 = Register('13427974-5', 'Christian', 20)
c2 = Register('23066987-2', 'Dante', 5)
```
* **Listas**: Es la estructura de datos más flexible. Es mutable, por lo que se puede editar como uno quiera, agregando, quitando o cambiando elementos de ella. Tienen un método ```sort()``` que ordena la lista. Para crear una se hace de forma parecida a las tuplas, aunque con corchetes en vez de paréntesis, por ejemplo ```nombre_lista = [item1, item2, item3]```o se puede usar ```list(información)```

###2.2 Pilas

Las pilas (o _stacks_) son una estructura que ordena los elementos según el principio de Last In First Out (LIFO). Es decir solo podemos sacar el último elemento que agregamos. Funciona como un tarro de pelotas de tenis, uno solo puede sacar la pelota que está más arriba, no hay forma de llegar a la de más abajo sin haber sacado las otras antes. 

Para usar pilas en Python, se debe trabajar con listas y algunos de sus métodos. Esto significa que igualmente uno puede acceder a los otros elementos, aunque eso no influye en el uso de estas. Los métodos son:

|Comando de Python       | Acción                                     |
|------------------------|--------------------------------------------|
| ```pila.append(item)```| Agrega item al final de la pila            |
|```pila.pop()```        | Extrae el último elemento y lo retorna     |
|```pila[-1]```          | Retorna el último elemento                 |
|```len(pila)```         | Retorna la cantidad de elementos en la pila|
|```len(pila) == 0```    | Indica si la pila esta vacía               |

###2.3 Colas

Las colas ordenan sus elementos según First In First Out (FIFO). Es decir el primero que llega es el primero que sale. Las colas en la vida real funcionan así: la primera persona que llega a una caja de supermercado es la primera en ser atendida.

Para usar colas en Python se debe importar el módulo **deque** de la librería _collections_. Los métodos implementados para las colas (deques) son:

|Comando de Python       | Acción                                     |
|------------------------|--------------------------------------------|
| ```deque.append(item)```| Agrega un item a la cola                  |
|```deque.popleft()```   | Extrae el primer elemento y lo retorna     |
|```deque[-1]```         | Retorna el primer elemento                 |
|```len(deque)```        | Retorna la cantidad de elementos en la cola|
|```len(deque) == 0```   | Indica si la cola esta vacía               |

###2.4 Diccionarios

###2.5 Sets

###2.6 Árboles

##3. <a name="functional"></a>Functional

##4. <a name="metaclases"></a>Metaclases

##5. <a name="excepciones"></a>Excepciones

##6. <a name="testing"></a>Testing

##7. <a name="simulacion"></a>Simulación

##8. <a name="threading"></a>Threading
