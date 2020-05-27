import { Controller, Res, Req, Get } from '@nestjs/common';
import { Response, Request } from 'express';
import { AppService } from './app.service';
var app = require("./services/app");

@Controller()
export class AppController {
  constructor(private appService: AppService) { }

  @Get()
  async root(@Res() res: Response, @Req() req: Request) {
    /*const expression = `SI (x IGUALQUE 99) REGRESA 10
    SI (x IGUALQUE 99) REGRESA 2
    SINO REGRESA 8
    `;
      var variables = {
        x: 99,
        z: 9
      };
      */

    if (req.query["par"] && req.query["variables"]) {
      
      var variables = {};
      var expression = String(req.query["par"]).trim();
      var varia = req.query["variables"];

      console.log(varia);
      console.log(expression);

      separador(varia).forEach(element => {
        element = String(element.replace(/\s+/g, ''));
        console.log(`${element}--\n`);
        try {
          variables[String(element).split("=")[0]] = Number(element.split("=")[1]);
        } catch (e) {

        }
      });

      let men;
      try {
        men = await app.evaluate(expression, variables);
      } catch (e) {
        men = e;
      }
      console.log(men);

      return res.render(
        this.appService.getIndex(),
        { mens: men },
      );
    } else {
      return res.render(
        this.appService.getIndex()
      );
    }
  }
}

function separador(cadenaADividir) {
  var regularExpre = /;|\n/
  var arrayDeCadenas = String(cadenaADividir).split(regularExpre);
  arrayDeCadenas = arrayDeCadenas.filter(texto => texto.length > 0);
  return arrayDeCadenas;
}