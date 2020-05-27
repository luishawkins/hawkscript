import * as nearley from 'nearley';
import * as _ from 'lodash';
import * as grammar from 'grammar';
//const grammar = require('grammar');

type IfStatement = [IMooLexerToken, ILogicalExpressions, IReturnStatement];
type ElseStatement = [IMooLexerToken, IReturnStatement];

interface IObject {
  [key: string]: any;
}

interface IEvaluationResult {
  evaluation: boolean;
  value: any;
}

interface IMooLexerToken {
  col: number;
  line: number;
  lineBreaks: number;
  offset: number;
  text: string;
  toString: () => any;
  type: string;
  value: any;
}

interface ILogicalExpressions
  extends Array<
    | ILogicalExpressions
    | IRelationalExpression
    | IConditionalExpression
    | IMissingLogicalExpression
  > {}

interface IRelationalExpression {
  type: LogicalExpressionTypes.RELATIONAL_EXPR;
  leftOp: string;
  relationalOp: string;
  rightOp: string;
}

interface IConditionalExpression {
  type: LogicalExpressionTypes.AND_EXPR | LogicalExpressionTypes.OR_EXPR;
  logicalOp: string;
  expression: ILogicalExpressions[];
}

interface IMissingLogicalExpression {
  type: LogicalExpressionTypes.IS_MISSING_EXPR;
  identifier: string;
}

interface IReturnStatement {
  returnToken: IMooLexerToken;
  valueToken: IMooLexerToken;
}

enum LogicalExpressionTypes {
  RELATIONAL_EXPR = 'RELATIONAL_EXPRESSION',
  AND_EXPR = 'AND_LOGICAL_EXPRESSION',
  OR_EXPR = 'OR_LOGICAL_EXPRESSION',
  IS_MISSING_EXPR = 'IS_MISSING_LOGICAL_EXPRESSION'
}

export const validate = async (input: string) => {
  try {
    const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
    parser.feed(input);
    const { results } = parser;

    if (results.length === 0) {
      throw new Error('Invalid/Unexpected/Empty input.');
    }

    return results;
  } catch (err) {
    return Promise.reject(err);
  }
};

export const evaluate = async (input: string, values: IObject) => {
  try {
    const results = await validate(input);

    const [ifStatements, elseStatement] = results[0];

    const ifStatementResults: IEvaluationResult[] = ifStatements
      .map((x: any) => x[0]) // Each if statement is wrapped inside an array from nearley parser results as per grammar (see grammar.ne)
      .map((ifStatement: IfStatement) =>
        handleIfExpression(ifStatement, values)
      );
    console.log(ifStatementResults);
    // As per spec, the last truthy evaluation among the sequence will be the result
    // so we reverse the list then find the first truthy evaluation to get the result
    ifStatementResults.reverse();
    const ifStatementResult = ifStatementResults.find(x => x.evaluation);
    const elseStatementResult = handleElseExpression(elseStatement);

    console.log(elseStatementResult);
    /*
    if(ifStatementResults.values){
      return ifStatementResults;
    }
    if(elseStatementResult.value){
      return elseStatementResult;
    }
    */
    return ifStatementResult
      ? ifStatementResult.value
      : elseStatementResult.value;
  } catch (err) {
    return Promise.reject(err);
  }
};

function handleIfExpression(
  ifStatement: IfStatement,
  values: IObject
): IEvaluationResult {
  const [ifToken, expressions, returnStatement] = ifStatement;

  if (ifToken.value !== 'SI') {
    throw new Error(
      `Failed to parse "IF expression" due to invalid token. Got ${
        ifToken.value
      }.`
    );
  }

  const { value } = parseReturnStatement(returnStatement);

  return {
    evaluation: evaluateExpression(reduceExpression(expressions), values),
    value
  };
}

function handleElseExpression(elseStatement: ElseStatement): IEvaluationResult {
  const [elseToken, returnStatement] = elseStatement;

  if (elseToken.value !== 'SINO') {
    throw new Error(
      `Failed to parse "ELSE expression" due to invalid token. Got "${
        elseToken.value
      }" instead.`
    );
  }

  const { value } = parseReturnStatement(returnStatement);

  return {
    evaluation: true,
    value
  };
}

function parseReturnStatement(returnStatement: IReturnStatement) {
  const { returnToken, valueToken } = returnStatement;

  if (returnToken.value !== 'REGRESA') {
    throw new Error(
      `Failed to parse RETURN_STATEMENT. Got "${returnToken.value}" instead.`
    );
  }

  return {
    keyword: returnToken.value,
    value: +valueToken.value
  };
}

function evaluateExpression(
  logicalExpressions: ILogicalExpressions,
  values: IObject
): boolean {
  let expressions = _.cloneDeep(logicalExpressions);
  expressions = !Array.isArray(expressions) ? [expressions] : expressions;

  if (expressions.length === 1) {
    const expression = expressions[0] as
      | IRelationalExpression
      | IMissingLogicalExpression;
    switch (expression.type) {
      case LogicalExpressionTypes.RELATIONAL_EXPR:
        return evaluateRelationalExpression(expression, values);
      case LogicalExpressionTypes.IS_MISSING_EXPR:
        return evaluateIsMissingLogicalExpression(expression, values);
    }
  }

  if (expressions.length === 2) {
    return evaluateConditionalExpression(expressions, values);
  }

  throw new Error(
    `Failed to evaluate expression. Got expression length of ${
      expressions.length
    }.`
  );
}

function evaluateConditionalExpression(
  logicalExpressions: ILogicalExpressions,
  values: IObject
): boolean {
  const expressions = _.cloneDeep(logicalExpressions) as any;

  const logicalExpression = expressions[0] as ILogicalExpressions;
  const conditionalExpression = expressions[1] as IConditionalExpression;

  switch (conditionalExpression.type) {
    case LogicalExpressionTypes.AND_EXPR:
      return (
        evaluateExpression(logicalExpression, values) &&
        evaluateExpression(conditionalExpression.expression, values)
      );
    case LogicalExpressionTypes.OR_EXPR:
      return (
        evaluateExpression(logicalExpression, values) ||
        evaluateExpression(conditionalExpression.expression, values)
      );
    default:
      throw new Error(
        `Failed to evaluate CONDITIONAL_EXPRESSION due to invalid type. Got "${
          conditionalExpression.type
        }" instead.`
      );
  }
}

/**
 * Evaluate relational expression.
 *
 * @example
 * x > 1
 * x == 2
 * x <= 3
 *
 * @param expression Relational expression
 * @param values Key-Value pair of identifier values
 */
function evaluateRelationalExpression(
  expression: IRelationalExpression,
  values: IObject
): boolean {
  const { type, leftOp, rightOp, relationalOp } = expression;

  if (type !== LogicalExpressionTypes.RELATIONAL_EXPR) {
    throw new Error(
      `Failed to evaluate ${
        LogicalExpressionTypes.RELATIONAL_EXPR
      }. Got ${type} instead.`
    );
  }

  const objValue = values[leftOp];

  if (objValue === null || objValue === undefined) {
    throw new Error(
      `Failed to evaluate "${leftOp} ${relationalOp} ${rightOp}". "${leftOp}" is not defined.`
    );
  }

  switch (relationalOp) {
    case '>':
      return +objValue > +rightOp;
    case '>=':
      return +objValue >= +rightOp;
    case '<':
      return +objValue < +rightOp;
    case '<=':
      return +objValue <= +rightOp;
    case 'IGUALQUE':
      return +objValue === +rightOp;
    default:
      throw new Error(
        `Failed to evaluate ${
          LogicalExpressionTypes.RELATIONAL_EXPR
        }. "${relationalOp}" is not supported.`
      );
  }
}

/**
 * Check if the given expression identifier does not exist (`undefined`) on `values` or is either `99` or `999`.
 *
 * @param expression Missing logical expression: `IS_MISSING()`
 * @param values Key-Value pair of identifier values
 */
function evaluateIsMissingLogicalExpression(
  expression: IMissingLogicalExpression,
  values: IObject
) {
  const { type, identifier } = expression;

  if (type !== LogicalExpressionTypes.IS_MISSING_EXPR) {
    throw new Error(
      `Failed to evaluate ${
        LogicalExpressionTypes.IS_MISSING_EXPR
      }. Got "${type}" instead.`
    );
  }

  const identifierValue = values[identifier];
  return (
    identifierValue == undefined ||
    identifierValue == 99 ||
    identifierValue == 999
  );
}

/**
 * This utility function is meant to reduce the redundancy of the expressions.
 * `((((((x > 0)))) AND y > 0))` will become `(x > 0 AND y > 0)`.
 *
 * @param logicalExpression List of logical expressions
 */
function reduceExpression(
  logicalExpression: ILogicalExpressions
): ILogicalExpressions {
  let expressions = _.cloneDeep(logicalExpression);

  if (Array.isArray(expressions)) {
    if (Array.isArray(expressions[0])) {
      if (expressions.length === 1) {
        expressions = expressions[0] as ILogicalExpressions;
        return reduceExpression(expressions);
      } else if (expressions.length === 2) {
        expressions[0] = reduceExpression(
          expressions[0] as ILogicalExpressions
        );
      }
    }

    if (expressions.length === 2) {
      const conditionalExpression = expressions[1] as IConditionalExpression;
      if (conditionalExpression.expression) {
        conditionalExpression.expression = reduceExpression(
          conditionalExpression.expression
        ) as ILogicalExpressions[];
      }
    }
  }

  return expressions;
}